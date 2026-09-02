package service

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

const (
	projectDeliveryLease       = 2 * time.Minute
	projectDeliveryTTL         = 7 * 24 * time.Hour
	projectDeliveryTimeout     = 2 * time.Hour
	projectDeliverySourceLimit = int64(8 << 30)
)

type projectDeliverySnapshot struct {
	Version         int                        `json:"version"`
	Project         model.Project              `json:"project"`
	Unit            model.ProjectUnit          `json:"unit"`
	FileBaseName    string                     `json:"fileBaseName"`
	TotalDurationMs int64                      `json:"totalDurationMs"`
	Shots           []projectDeliveryShot      `json:"shots"`
	Assets          []ProjectAssetSummary      `json:"assets"`
	References      []model.ShotAssetReference `json:"references"`
}

type projectDeliveryShot struct {
	Index      int                `json:"index"`
	StartMs    int64              `json:"startMs"`
	EndMs      int64              `json:"endMs"`
	Shot       model.Shot         `json:"shot"`
	Revision   model.ShotRevision `json:"revision"`
	Artifact   model.ShotArtifact `json:"artifact"`
	ResourceID string             `json:"resourceId"`
}

type projectDeliveryManifest struct {
	App        string         `json:"app"`
	Format     string         `json:"format"`
	Version    int            `json:"version"`
	ExportedAt string         `json:"exportedAt"`
	Project    map[string]any `json:"project"`
	Unit       map[string]any `json:"unit"`
	Summary    map[string]any `json:"summary"`
	Files      map[string]any `json:"files"`
}

func (s *Service) CreateProjectDeliveryJob(userID string, projectID string, unitID string) (*model.ProjectDeliveryJob, error) {
	// Delivery is a read-only derivative of already approved videos, so archived
	// projects remain exportable even though their production data is immutable.
	project, err := s.repo.ProjectForUser(userID, projectID)
	if err != nil {
		return nil, err
	}
	unit, err := s.repo.ProjectUnit(projectID, unitID)
	if err != nil {
		return nil, err
	}
	if latest, err := s.repo.LatestProjectDeliveryJob(userID, projectID, unitID); err != nil {
		return nil, err
	} else if latest != nil && (latest.Status == model.ProjectDeliveryJobStatusQueued || latest.Status == model.ProjectDeliveryJobStatusRunning) {
		return latest, nil
	}
	if _, err := s.deliveryFFmpegExecutable(); err != nil {
		return nil, &AppError{Status: 503, Message: "服务器暂未配置视频合成组件，请先使用本机生成交付包", Cause: err}
	}
	snapshot, sourceBytes, err := s.buildProjectDeliverySnapshot(userID, *project, *unit)
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	activeKey := strings.Join([]string{userID, projectID, unitID}, ":")
	job := &model.ProjectDeliveryJob{
		ID: newID(), UserID: userID, ProjectID: projectID, UnitID: unitID,
		Status: model.ProjectDeliveryJobStatusQueued, Stage: "等待服务器生成", Progress: 0,
		FileName: snapshot.FileBaseName + "-交付包.zip", SourceBytes: sourceBytes,
		SnapshotJSON: string(raw), ActiveKey: &activeKey, CreatedAt: now, UpdatedAt: now,
	}
	stored, _, err := s.repo.CreateProjectDeliveryJob(job)
	return stored, err
}

func (s *Service) ProjectDeliveryJob(userID string, projectID string, unitID string, id string) (*model.ProjectDeliveryJob, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return nil, err
	}
	if _, err := s.repo.ProjectUnit(projectID, unitID); err != nil {
		return nil, err
	}
	return s.repo.ProjectDeliveryJobForUser(userID, projectID, unitID, id)
}

func (s *Service) OpenProjectDeliveryJob(userID string, projectID string, unitID string, id string, rangeHeader string) (*model.ProjectDeliveryJob, *ResourceStream, error) {
	job, err := s.ProjectDeliveryJob(userID, projectID, unitID, id)
	if err != nil {
		return nil, nil, err
	}
	if job.Status != model.ProjectDeliveryJobStatusSucceeded || strings.TrimSpace(job.ResourceID) == "" {
		return nil, nil, BadAuthRequest("交付包尚未生成完成")
	}
	if job.ExpiresAt != nil && !job.ExpiresAt.After(time.Now()) {
		return nil, nil, BadAuthRequest("交付包已过期，请重新生成")
	}
	stream, err := s.OpenResourceRange(userID, job.ResourceID, rangeHeader)
	if err != nil {
		return nil, nil, err
	}
	return job, stream, nil
}

func (s *Service) LatestProjectDeliveryJob(userID string, projectID string, unitID string) (*model.ProjectDeliveryJob, error) {
	if _, err := s.repo.ProjectForUser(userID, projectID); err != nil {
		return nil, err
	}
	if _, err := s.repo.ProjectUnit(projectID, unitID); err != nil {
		return nil, err
	}
	return s.repo.LatestProjectDeliveryJob(userID, projectID, unitID)
}

func (s *Service) buildProjectDeliverySnapshot(userID string, project model.Project, unit model.ProjectUnit) (projectDeliverySnapshot, int64, error) {
	shots, err := s.repo.ProjectUnitShots(project.ID, unit.ID)
	if err != nil {
		return projectDeliverySnapshot{}, 0, err
	}
	if len(shots) == 0 {
		return projectDeliverySnapshot{}, 0, BadAuthRequest("当前章节还没有分镜，无法生成交付包")
	}
	revisions, err := s.repo.ProjectUnitShotRevisions(project.ID, unit.ID)
	if err != nil {
		return projectDeliverySnapshot{}, 0, err
	}
	artifacts, err := s.repo.ProjectUnitShotArtifacts(project.ID, unit.ID)
	if err != nil {
		return projectDeliverySnapshot{}, 0, err
	}
	revisionByID := make(map[string]model.ShotRevision, len(revisions))
	latestRevisionByShot := make(map[string]model.ShotRevision, len(shots))
	for _, revision := range revisions {
		revisionByID[revision.ID] = revision
		if current, exists := latestRevisionByShot[revision.ShotID]; !exists || revision.Version > current.Version {
			latestRevisionByShot[revision.ShotID] = revision
		}
	}
	selectedVideoByShot := make(map[string]model.ShotArtifact, len(shots))
	for _, artifact := range artifacts {
		if artifact.Type != "video" || artifact.Status != "ready" || !artifact.Selected || strings.TrimSpace(artifact.ResourceID) == "" {
			continue
		}
		current, exists := selectedVideoByShot[artifact.ShotID]
		if !exists || artifact.Version > current.Version || (artifact.Version == current.Version && artifact.CreatedAt.After(current.CreatedAt)) {
			selectedVideoByShot[artifact.ShotID] = artifact
		}
	}
	snapshot := projectDeliverySnapshot{
		Version: 1, Project: project, Unit: unit,
		FileBaseName: safeProjectDeliveryFileName(project.Name) + "-" + safeProjectDeliveryFileName(unit.Title),
		Shots:        make([]projectDeliveryShot, 0, len(shots)),
	}
	missing := make([]string, 0)
	var cursorMs int64
	var sourceBytes int64
	for index, shot := range shots {
		revision, exists := revisionByID[shot.CurrentRevisionID]
		if !exists {
			revision = latestRevisionByShot[shot.ID]
		}
		artifact, exists := selectedVideoByShot[shot.ID]
		if !exists {
			missing = append(missing, shot.Title)
			continue
		}
		resource, resourceErr := s.repo.ResourceForUser(userID, artifact.ResourceID)
		if resourceErr != nil || resource.Status != model.ResourceStatusReady || resource.Kind != "video" {
			missing = append(missing, shot.Title)
			continue
		}
		durationMs := revision.DurationMs
		if durationMs <= 0 {
			durationMs = shot.DurationMs
		}
		if durationMs < 0 {
			durationMs = 0
		}
		snapshot.Shots = append(snapshot.Shots, projectDeliveryShot{
			Index: index + 1, StartMs: cursorMs, EndMs: cursorMs + durationMs,
			Shot: shot, Revision: revision, Artifact: artifact, ResourceID: resource.ID,
		})
		cursorMs += durationMs
		sourceBytes += resource.Size
		if sourceBytes > projectDeliverySourceLimit {
			return projectDeliverySnapshot{}, 0, BadAuthRequest("章节视频总量超过服务器单次交付上限，请拆分章节后再试")
		}
	}
	if len(missing) > 0 {
		visible := missing
		if len(visible) > 3 {
			visible = append(append([]string{}, visible[:3]...), fmt.Sprintf("等 %d 个镜头", len(missing)))
		}
		return projectDeliverySnapshot{}, 0, BadAuthRequest("仍有镜头缺少已选中的可用视频：" + strings.Join(visible, "、"))
	}
	snapshot.TotalDurationMs = cursorMs
	assets, err := s.repo.ProjectUnitAssets(userID, project.ID, unit.ID)
	if err != nil {
		return projectDeliverySnapshot{}, 0, err
	}
	snapshot.Assets = make([]ProjectAssetSummary, 0, len(assets))
	for index := range assets {
		summary, summaryErr := s.projectAssetSummary(userID, project.ID, &assets[index])
		if summaryErr != nil {
			return projectDeliverySnapshot{}, 0, summaryErr
		}
		snapshot.Assets = append(snapshot.Assets, summary)
	}
	sortProjectDeliveryAssets(snapshot.Assets)
	snapshot.References, err = s.repo.ProjectUnitShotAssetReferences(project.ID, unit.ID)
	if err != nil {
		return projectDeliverySnapshot{}, 0, err
	}
	return snapshot, sourceBytes, nil
}

func safeProjectDeliveryFileName(value string) string {
	value = strings.TrimSpace(value)
	value = strings.Map(func(r rune) rune {
		switch r {
		case '\\', '/', ':', '*', '?', '"', '<', '>', '|':
			return '_'
		}
		if r < 0x20 {
			return '_'
		}
		return r
	}, value)
	value = strings.TrimRight(value, ". ")
	if value == "" {
		return "未命名"
	}
	return truncateRunes(value, 100)
}

func (s *Service) deliveryFFmpegExecutable() (string, error) {
	if strings.TrimSpace(s.deliveryFFmpegPath) != "" {
		return s.deliveryFFmpegPath, nil
	}
	path, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", err
	}
	return path, nil
}

func (s *Service) startProjectDeliveryWorker(ctx context.Context) {
	s.runWorkerLoop(func(ctx context.Context) {
		s.cleanupExpiredProjectDeliveryJobs(25)
		slots := make(chan struct{}, 1)
		dispatch := func() {
			if ctx.Err() != nil || s.IsDraining() || len(slots) > 0 {
				return
			}
			job, err := s.repo.ClaimNextProjectDeliveryJob("delivery:"+s.workerID, projectDeliveryLease)
			if err != nil {
				log.Printf("project delivery worker claim failed: %v", err)
				return
			}
			if job == nil {
				return
			}
			slots <- struct{}{}
			if !s.runWorkerTask(func() {
				defer func() { <-slots }()
				s.processProjectDeliveryJob(ctx, job)
			}) {
				<-slots
			}
		}
		dispatch()
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		lastCleanup := time.Now()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				dispatch()
				if time.Since(lastCleanup) >= time.Hour {
					s.cleanupExpiredProjectDeliveryJobs(25)
					lastCleanup = time.Now()
				}
			}
		}
	})
}

func (s *Service) processProjectDeliveryJob(parent context.Context, job *model.ProjectDeliveryJob) {
	owner := "delivery:" + s.workerID
	ctx, cancel := context.WithTimeout(parent, projectDeliveryTimeout)
	defer cancel()
	leaseDone := make(chan struct{})
	var leaseLost atomic.Bool
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-leaseDone:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := s.repo.RenewProjectDeliveryJobLease(job.ID, owner, projectDeliveryLease); err != nil {
					leaseLost.Store(true)
					cancel()
					return
				}
			}
		}
	}()
	defer close(leaseDone)
	resource, fileName, err := s.generateProjectDeliveryArchive(ctx, job, owner)
	if err != nil {
		// Shutdown and lease loss are recoverable. Leave the durable job running;
		// another worker will reclaim it after the lease expires.
		if parent.Err() != nil || leaseLost.Load() {
			return
		}
		message := truncateRunes(err.Error(), 2_000)
		if updateErr := s.repo.FailProjectDeliveryJob(job.ID, owner, message); updateErr != nil {
			log.Printf("project delivery failure update failed: job=%s error=%v", job.ID, updateErr)
		}
		return
	}
	if err := s.repo.CompleteProjectDeliveryJob(job.ID, owner, resource.ID, fileName, time.Now().Add(projectDeliveryTTL)); err != nil {
		log.Printf("project delivery completion failed: job=%s resource=%s error=%v", job.ID, resource.ID, err)
		if cleanupErr := s.deleteStoredResourceObject(job.UserID, resource); cleanupErr == nil {
			_ = s.repo.DeleteResource(job.UserID, resource.ID)
		}
	}
}

func (s *Service) generateProjectDeliveryArchive(ctx context.Context, job *model.ProjectDeliveryJob, owner string) (*model.Resource, string, error) {
	var snapshot projectDeliverySnapshot
	if err := json.Unmarshal([]byte(job.SnapshotJSON), &snapshot); err != nil || snapshot.Version != 1 || len(snapshot.Shots) == 0 {
		return nil, "", errors.New("交付任务快照无效，请重新提交")
	}
	ffmpegPath, err := s.deliveryFFmpegExecutable()
	if err != nil {
		return nil, "", errors.New("服务器视频合成组件不可用")
	}
	workRoot := filepath.Join(s.dataDir, "delivery-work")
	if strings.TrimSpace(s.dataDir) == "" {
		workRoot = os.TempDir()
	} else if err := os.MkdirAll(workRoot, 0o750); err != nil {
		return nil, "", err
	}
	workDir, err := os.MkdirTemp(workRoot, "job-")
	if err != nil {
		return nil, "", err
	}
	defer os.RemoveAll(workDir)
	inputNames := make([]string, 0, len(snapshot.Shots))
	var copiedBytes int64
	for index, shot := range snapshot.Shots {
		if err := s.repo.UpdateProjectDeliveryJobProgress(job.ID, owner, fmt.Sprintf("正在读取镜头 %d / %d", index+1, len(snapshot.Shots)), 10+int(float64(index)*30/float64(len(snapshot.Shots)))); err != nil {
			return nil, "", err
		}
		resource, body, openErr := s.OpenResource(job.UserID, shot.ResourceID)
		if openErr != nil {
			return nil, "", fmt.Errorf("无法读取镜头“%s”的视频", shot.Shot.Title)
		}
		name := fmt.Sprintf("shot-%04d%s", index, deliveryVideoExtension(resource.MimeType))
		path := filepath.Join(workDir, name)
		file, createErr := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
		if createErr == nil {
			var written int64
			written, createErr = io.Copy(file, io.LimitReader(body, projectDeliverySourceLimit-copiedBytes+1))
			copiedBytes += written
			if closeErr := file.Close(); createErr == nil {
				createErr = closeErr
			}
		}
		body.Close()
		if createErr != nil {
			return nil, "", createErr
		}
		if copiedBytes > projectDeliverySourceLimit {
			return nil, "", errors.New("章节视频总量超过服务器单次交付上限")
		}
		inputNames = append(inputNames, name)
	}
	concatText := strings.Builder{}
	for _, name := range inputNames {
		concatText.WriteString("file '")
		concatText.WriteString(strings.ReplaceAll(name, "'", "'\\''"))
		concatText.WriteString("'\n")
	}
	if err := os.WriteFile(filepath.Join(workDir, "concat.txt"), []byte(concatText.String()), 0o640); err != nil {
		return nil, "", err
	}
	if err := s.repo.UpdateProjectDeliveryJobProgress(job.ID, owner, "正在合成 MP4 成片", 45); err != nil {
		return nil, "", err
	}
	outputName := "final.mp4"
	copyArgs := []string{"-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-c", "copy", "-movflags", "+faststart", outputName}
	if commandErr := runProjectDeliveryFFmpeg(ctx, ffmpegPath, workDir, copyArgs); commandErr != nil {
		_ = os.Remove(filepath.Join(workDir, outputName))
		reencodeArgs := []string{"-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-movflags", "+faststart", outputName}
		if retryErr := runProjectDeliveryFFmpeg(ctx, ffmpegPath, workDir, reencodeArgs); retryErr != nil {
			return nil, "", retryErr
		}
	}
	if err := s.repo.UpdateProjectDeliveryJobProgress(job.ID, owner, "正在打包字幕与生产资料", 85); err != nil {
		return nil, "", err
	}
	archivePath := filepath.Join(workDir, "delivery.zip")
	exportedAt := time.Now().UTC()
	if err := writeProjectDeliveryZip(archivePath, filepath.Join(workDir, outputName), snapshot, exportedAt); err != nil {
		return nil, "", err
	}
	info, err := os.Stat(archivePath)
	if err != nil {
		return nil, "", err
	}
	if err := s.reserveDeliveryResourceQuota(job.UserID, info.Size()); err != nil {
		return nil, "", err
	}
	archive, err := os.Open(archivePath)
	if err != nil {
		s.releaseDeliveryResourceQuota(job.UserID, info.Size())
		return nil, "", err
	}
	fileName := snapshot.FileBaseName + "-交付包.zip"
	resource, storeErr := s.storeResource(job.UserID, "file", fileName, "application/zip", info.Size(), 0, 0, 0, archive)
	_ = archive.Close()
	if storeErr != nil {
		s.releaseDeliveryResourceQuota(job.UserID, info.Size())
		return nil, "", storeErr
	}
	s.commitUserUploadQuota(job.UserID, info.Size())
	return resource, fileName, nil
}

func deliveryVideoExtension(mimeType string) string {
	switch strings.ToLower(strings.TrimSpace(mimeType)) {
	case "video/webm":
		return ".webm"
	case "video/quicktime":
		return ".mov"
	default:
		return ".mp4"
	}
}

func runProjectDeliveryFFmpeg(ctx context.Context, executable string, workDir string, args []string) error {
	command := exec.CommandContext(ctx, executable, args...)
	command.Dir = workDir
	var output bytes.Buffer
	command.Stdout = &limitedDeliveryLogWriter{buffer: &output, limit: 64 << 10}
	command.Stderr = &limitedDeliveryLogWriter{buffer: &output, limit: 64 << 10}
	if err := command.Run(); err != nil {
		if ctx.Err() != nil {
			return errors.New("服务器生成交付包超时，请重试或改用本机生成")
		}
		detail := strings.TrimSpace(output.String())
		if detail == "" {
			detail = err.Error()
		}
		return fmt.Errorf("视频合成失败：%s", truncateRunes(detail, 1_000))
	}
	return nil
}

type limitedDeliveryLogWriter struct {
	buffer *bytes.Buffer
	limit  int
}

func (w *limitedDeliveryLogWriter) Write(data []byte) (int, error) {
	original := len(data)
	if w.buffer.Len() < w.limit {
		remaining := w.limit - w.buffer.Len()
		if len(data) > remaining {
			data = data[:remaining]
		}
		_, _ = w.buffer.Write(data)
	}
	return original, nil
}

func writeProjectDeliveryZip(archivePath string, videoPath string, snapshot projectDeliverySnapshot, exportedAt time.Time) error {
	archive, err := os.OpenFile(archivePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o640)
	if err != nil {
		return err
	}
	writer := zip.NewWriter(archive)
	videoName := "成片/" + snapshot.FileBaseName + ".mp4"
	videoHeader := &zip.FileHeader{Name: videoName, Method: zip.Store}
	videoHeader.SetModTime(exportedAt)
	videoEntry, err := writer.CreateHeader(videoHeader)
	if err == nil {
		var video *os.File
		video, err = os.Open(videoPath)
		if err == nil {
			_, err = io.Copy(videoEntry, video)
			_ = video.Close()
		}
	}
	if err == nil {
		textFiles := projectDeliveryTextFiles(snapshot, exportedAt)
		names := make([]string, 0, len(textFiles))
		for name := range textFiles {
			names = append(names, name)
		}
		sort.Strings(names)
		for _, name := range names {
			data := textFiles[name]
			header := &zip.FileHeader{Name: name, Method: zip.Deflate}
			header.SetModTime(exportedAt)
			var entry io.Writer
			entry, err = writer.CreateHeader(header)
			if err != nil {
				break
			}
			_, err = entry.Write(data)
			if err != nil {
				break
			}
		}
	}
	closeZipErr := writer.Close()
	closeFileErr := archive.Close()
	return errors.Join(err, closeZipErr, closeFileErr)
}

func projectDeliveryTextFiles(snapshot projectDeliverySnapshot, exportedAt time.Time) map[string][]byte {
	exported := exportedAt.Format(time.RFC3339)
	videoPath := "成片/" + snapshot.FileBaseName + ".mp4"
	srtPath := "字幕/" + snapshot.FileBaseName + ".srt"
	manifest := projectDeliveryManifest{
		App: "影策", Format: "short-drama-delivery", Version: 1, ExportedAt: exported,
		Project: map[string]any{"id": snapshot.Project.ID, "name": snapshot.Project.Name},
		Unit:    map[string]any{"id": snapshot.Unit.ID, "title": snapshot.Unit.Title},
		Summary: map[string]any{"shotCount": len(snapshot.Shots), "durationMs": snapshot.TotalDurationMs, "assetCount": len(snapshot.Assets)},
		Files:   map[string]any{"finalVideo": videoPath, "subtitles": srtPath, "shotsJson": "分镜/shots.json", "shotsCsv": "分镜/shots.csv", "assets": "资产/assets.json"},
	}
	shots := map[string]any{"version": 1, "exportedAt": exported, "projectId": snapshot.Project.ID, "unitId": snapshot.Unit.ID, "durationMs": snapshot.TotalDurationMs, "shots": snapshot.Shots}
	assets := map[string]any{"version": 1, "exportedAt": exported, "projectId": snapshot.Project.ID, "unitId": snapshot.Unit.ID, "assets": snapshot.Assets, "references": snapshot.References}
	manifestJSON, _ := json.MarshalIndent(manifest, "", "  ")
	shotsJSON, _ := json.MarshalIndent(shots, "", "  ")
	assetsJSON, _ := json.MarshalIndent(assets, "", "  ")
	readme := strings.Join([]string{
		snapshot.Project.Name + " / " + snapshot.Unit.Title + " 交付包", "",
		"导出时间：" + exported,
		"镜头数：" + strconv.Itoa(len(snapshot.Shots)),
		fmt.Sprintf("成片时长：%.1f 秒", float64(snapshot.TotalDurationMs)/1000), "",
		"内容说明：", "- " + videoPath + "：按分镜顺序合成的 MP4 成片", "- " + srtPath + "：按镜头时长生成的台词字幕",
		"- 分镜/shots.json 与 分镜/shots.csv：分镜、生成参数与资源对应关系", "- 资产/assets.json：当前章节镜头引用的资产版本清单", "",
		"注：交付包由服务器后台生成，完成后 7 天内可下载。",
	}, "\n")
	return map[string][]byte{
		"manifest.json": manifestJSON, "交付说明.txt": []byte(readme), srtPath: []byte(buildProjectDeliverySRT(snapshot)),
		"分镜/shots.json": shotsJSON, "分镜/shots.csv": buildProjectDeliveryCSV(snapshot), "资产/assets.json": assetsJSON,
	}
}

func buildProjectDeliverySRT(snapshot projectDeliverySnapshot) string {
	items := make([]string, 0, len(snapshot.Shots))
	for _, shot := range snapshot.Shots {
		dialogue := strings.TrimSpace(shot.Revision.Dialogue)
		if dialogue == "" {
			continue
		}
		items = append(items, strings.Join([]string{strconv.Itoa(len(items) + 1), formatProjectDeliverySRTTime(shot.StartMs) + " --> " + formatProjectDeliverySRTTime(shot.EndMs), dialogue}, "\n"))
	}
	return strings.Join(items, "\n\n")
}

func formatProjectDeliverySRTTime(ms int64) string {
	if ms < 0 {
		ms = 0
	}
	hours := ms / 3_600_000
	minutes := (ms % 3_600_000) / 60_000
	seconds := (ms % 60_000) / 1_000
	millis := ms % 1_000
	return fmt.Sprintf("%02d:%02d:%02d,%03d", hours, minutes, seconds, millis)
}

func buildProjectDeliveryCSV(snapshot projectDeliverySnapshot) []byte {
	var buffer bytes.Buffer
	buffer.WriteString("\xEF\xBB\xBF")
	writer := csv.NewWriter(&buffer)
	_ = writer.Write([]string{"序号", "镜头名称", "开始时间(ms)", "结束时间(ms)", "时长(ms)", "剧情描述", "动作", "台词", "景别", "机位", "运镜", "图片提示词", "视频提示词", "负向提示词", "接戏备注", "视频资源ID"})
	for _, item := range snapshot.Shots {
		_ = writer.Write([]string{
			strconv.Itoa(item.Index), item.Shot.Title, strconv.FormatInt(item.StartMs, 10), strconv.FormatInt(item.EndMs, 10), strconv.FormatInt(item.EndMs-item.StartMs, 10),
			firstNonEmpty(item.Revision.PlotDescription, item.Shot.Description), item.Revision.Action, item.Revision.Dialogue, item.Revision.ShotSize, item.Revision.CameraAngle,
			item.Revision.CameraMovement, item.Revision.ImagePrompt, item.Revision.VideoPrompt, item.Revision.NegativePrompt, item.Revision.ContinuityNotes, item.ResourceID,
		})
	}
	writer.Flush()
	return buffer.Bytes()
}

func (s *Service) cleanupExpiredProjectDeliveryJobs(limit int) {
	jobs, err := s.repo.ExpiredProjectDeliveryJobs(time.Now(), limit)
	if err != nil {
		log.Printf("project delivery expiration scan failed: %v", err)
		return
	}
	deleted := 0
	for _, job := range jobs {
		resource, resourceErr := s.repo.Resource(job.ResourceID)
		if resourceErr != nil && !errors.Is(resourceErr, gorm.ErrRecordNotFound) {
			log.Printf("project delivery expiration resource lookup failed: job=%s error=%v", job.ID, resourceErr)
			continue
		}
		var deletionJob *model.ResourceDeletionJob
		if resource != nil && resource.ID != "" {
			deletionJob = &model.ResourceDeletionJob{
				ID: newID(), UserID: job.UserID, ResourceID: resource.ID, Provider: resource.Provider, Endpoint: resource.Endpoint,
				Bucket: resource.Bucket, StorageSettingID: resource.StorageSettingID, ObjectKey: resource.ObjectKey,
				Status: model.ResourceDeletionStatusPending, NextAttemptAt: time.Now(),
			}
		}
		expired, expireErr := s.repo.ExpireProjectDeliveryJob(job.ID, resource, deletionJob)
		if expireErr != nil {
			log.Printf("project delivery expiration failed: job=%s error=%v", job.ID, expireErr)
			continue
		}
		if expired && deletionJob != nil {
			deleted++
		}
	}
	if deleted > 0 {
		s.drainResourceDeletionJobs(deleted)
	}
}

func sortProjectDeliveryAssets(items []ProjectAssetSummary) {
	sort.SliceStable(items, func(left, right int) bool {
		if items[left].Position != items[right].Position {
			return items[left].Position < items[right].Position
		}
		return items[left].Title < items[right].Title
	})
}
