package service

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func newProjectDeliveryTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(
		&model.Project{}, &model.ProjectUnit{}, &model.Shot{}, &model.ShotRevision{}, &model.ShotArtifact{},
		&model.Resource{}, &model.ResourceDeletionJob{}, &model.ProjectDeliveryJob{},
		&model.Asset{}, &model.ProjectAssetLink{}, &model.AssetVersion{}, &model.ShotAssetReference{},
	); err != nil {
		t.Fatal(err)
	}
	toolDir := t.TempDir()
	ffmpegPath := filepath.Join(toolDir, "ffmpeg")
	truePath, err := exec.LookPath("true")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"ffmpeg", "ffprobe"} {
		if err := os.Symlink(truePath, filepath.Join(toolDir, name)); err != nil {
			t.Fatal(err)
		}
	}
	return &Service{repo: repository.New(db), dataDir: t.TempDir(), deliveryFFmpegPath: ffmpegPath}, db
}

func seedProjectDeliveryPlan(t *testing.T, db *gorm.DB) {
	t.Helper()
	now := time.Now()
	items := []any{
		&model.Project{ID: "project-1", UserID: "user-1", Name: "雨夜/追凶", Status: model.ProjectStatusActive},
		&model.ProjectUnit{ID: "unit-1", ProjectID: "project-1", Title: "第一集", Position: 0},
		&model.Shot{ID: "shot-2", ProjectID: "project-1", UnitID: "unit-1", CurrentRevisionID: "revision-2", Title: "镜头二", Position: 2, DurationMs: 2_000, CreatedAt: now.Add(time.Second)},
		&model.Shot{ID: "shot-1", ProjectID: "project-1", UnitID: "unit-1", CurrentRevisionID: "revision-1", Title: "镜头一", Position: 1, DurationMs: 1_000, CreatedAt: now},
		&model.ShotRevision{ID: "revision-1", ShotID: "shot-1", Version: 1, Dialogue: "别回头", DurationMs: 1_500},
		&model.ShotRevision{ID: "revision-2", ShotID: "shot-2", Version: 1, Dialogue: "快走", DurationMs: 2_500},
		&model.Resource{ID: "resource-1", UserID: "user-1", Kind: "video", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/user-1/video/one.mp4", MimeType: "video/mp4", Size: 11},
		&model.Resource{ID: "resource-2", UserID: "user-1", Kind: "video", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: "users/user-1/video/two.mp4", MimeType: "video/mp4", Size: 13},
		&model.ShotArtifact{ID: "artifact-1", ProjectID: "project-1", UnitID: "unit-1", ShotID: "shot-1", RevisionID: "revision-1", Type: "video", Version: 1, ResourceID: "resource-1", Status: "ready", Selected: true},
		&model.ShotArtifact{ID: "artifact-2", ProjectID: "project-1", UnitID: "unit-1", ShotID: "shot-2", RevisionID: "revision-2", Type: "video", Version: 1, ResourceID: "resource-2", Status: "ready", Selected: true},
	}
	for _, item := range items {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
}

func TestCreateProjectDeliveryJobFreezesPlanAndDeduplicatesActiveSubmission(t *testing.T) {
	svc, db := newProjectDeliveryTestService(t)
	seedProjectDeliveryPlan(t, db)

	first, err := svc.CreateProjectDeliveryJob("user-1", "project-1", "unit-1")
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.CreateProjectDeliveryJob("user-1", "project-1", "unit-1")
	if err != nil {
		t.Fatal(err)
	}
	if first.ID != second.ID {
		t.Fatalf("duplicate active job ids = %s, %s", first.ID, second.ID)
	}
	if first.SourceBytes != 24 || first.FileName != "雨夜_追凶-第一集-交付包.zip" {
		t.Fatalf("job = %#v", first)
	}
	var snapshot projectDeliverySnapshot
	if err := json.Unmarshal([]byte(first.SnapshotJSON), &snapshot); err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Shots) != 2 || snapshot.Shots[0].Shot.ID != "shot-1" || snapshot.Shots[1].StartMs != 1_500 || snapshot.TotalDurationMs != 4_000 {
		t.Fatalf("snapshot shots = %#v", snapshot.Shots)
	}
	var count int64
	if err := db.Model(&model.ProjectDeliveryJob{}).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("delivery job count = %d, error = %v", count, err)
	}
}

func TestCreateProjectDeliveryJobRejectsMissingSelectedVideo(t *testing.T) {
	svc, db := newProjectDeliveryTestService(t)
	seedProjectDeliveryPlan(t, db)
	if err := db.Model(&model.ShotArtifact{}).Where("id = ?", "artifact-2").Updates(map[string]any{"selected": false, "status": "stale"}).Error; err != nil {
		t.Fatal(err)
	}
	_, err := svc.CreateProjectDeliveryJob("user-1", "project-1", "unit-1")
	if err == nil || !strings.Contains(err.Error(), "镜头二") {
		t.Fatalf("CreateProjectDeliveryJob() error = %v", err)
	}
}

func TestProjectDeliveryTextFilesAndZipContract(t *testing.T) {
	snapshot := projectDeliverySnapshot{
		Version: 1, Project: model.Project{ID: "project-1", Name: "雨夜追凶"}, Unit: model.ProjectUnit{ID: "unit-1", Title: "第一集"},
		FileBaseName: "雨夜追凶-第一集", TotalDurationMs: 1_500,
		Shots: []projectDeliveryShot{{Index: 1, StartMs: 0, EndMs: 1_500, Shot: model.Shot{ID: "shot-1", Title: "镜头一"}, Revision: model.ShotRevision{Dialogue: "别回头"}, ResourceID: "resource-1"}},
	}
	files := projectDeliveryTextFiles(snapshot, time.Date(2026, 9, 3, 8, 0, 0, 0, time.UTC))
	if got := string(files["字幕/雨夜追凶-第一集.srt"]); got != "1\n00:00:00,000 --> 00:00:01,500\n别回头" {
		t.Fatalf("srt = %q", got)
	}
	if !strings.HasPrefix(string(files["分镜/shots.csv"]), "\xEF\xBB\xBF序号,镜头名称") {
		t.Fatalf("csv = %q", files["分镜/shots.csv"])
	}
	workDir := t.TempDir()
	videoPath := filepath.Join(workDir, "final.mp4")
	archivePath := filepath.Join(workDir, "delivery.zip")
	if err := os.WriteFile(videoPath, []byte("video"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeProjectDeliveryZip(archivePath, videoPath, snapshot, time.Now()); err != nil {
		t.Fatal(err)
	}
	reader, err := zip.OpenReader(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	want := map[string]bool{"manifest.json": false, "交付说明.txt": false, "分镜/shots.csv": false, "分镜/shots.json": false, "字幕/雨夜追凶-第一集.srt": false, "成片/雨夜追凶-第一集.mp4": false, "资产/assets.json": false}
	for _, file := range reader.File {
		if _, exists := want[file.Name]; exists {
			want[file.Name] = true
		}
	}
	for name, found := range want {
		if !found {
			t.Fatalf("zip missing %s", name)
		}
	}
}

func TestProjectDeliveryNormalizeArgsAlwaysProducesCompatibleAudioAndVideo(t *testing.T) {
	withAudio := strings.Join(projectDeliveryNormalizeArgs("source.webm", "normalized.mp4", 1280, 720, true), " ")
	if !strings.Contains(withAudio, "-map 0:a:0") || strings.Contains(withAudio, "anullsrc") {
		t.Fatalf("with-audio args = %s", withAudio)
	}
	withoutAudio := strings.Join(projectDeliveryNormalizeArgs("source.mp4", "normalized.mp4", 720, 1280, false), " ")
	for _, expected := range []string{"anullsrc=channel_layout=stereo:sample_rate=48000", "-map 1:a:0", "pad=720:1280", "-pix_fmt yuv420p", "-ar 48000", "-ac 2"} {
		if !strings.Contains(withoutAudio, expected) {
			t.Fatalf("without-audio args missing %q: %s", expected, withoutAudio)
		}
	}
}

func TestProjectDeliveryCopyCompatibilityRejectsMixedStreams(t *testing.T) {
	base := projectDeliveryMediaInfo{
		Width: 1280, Height: 720, HasAudio: true, VideoCodec: "h264", PixelFormat: "yuv420p",
		FrameRate: "30/1", VideoTimeBase: "1/15360", AudioCodec: "aac", SampleRate: "48000",
		Channels: 2, ChannelLayout: "stereo", AudioTimeBase: "1/48000", DurationSecond: 1,
	}
	if !projectDeliveryInputsCopyCompatible([]projectDeliveryMediaInfo{base, base}) {
		t.Fatal("identical streams should use lossless concatenation")
	}
	mixedCodec := base
	mixedCodec.VideoCodec = "vp9"
	if projectDeliveryInputsCopyCompatible([]projectDeliveryMediaInfo{base, mixedCodec}) {
		t.Fatal("mixed video codecs must be normalized before concatenation")
	}
	missingAudio := base
	missingAudio.HasAudio = false
	if projectDeliveryInputsCopyCompatible([]projectDeliveryMediaInfo{base, missingAudio}) {
		t.Fatal("mixed audio presence must be normalized before concatenation")
	}
	if got := projectDeliveryMediaDuration([]projectDeliveryMediaInfo{base, base}); got != 2 {
		t.Fatalf("duration = %v", got)
	}
}

func TestCleanupExpiredProjectDeliveryRemovesResourceThroughOutbox(t *testing.T) {
	svc, db := newProjectDeliveryTestService(t)
	now := time.Now()
	objectKey := "users/user-1/file/delivery.zip"
	resourcePath := filepath.Join(svc.dataDir, "resources", filepath.FromSlash(objectKey))
	if err := os.MkdirAll(filepath.Dir(resourcePath), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(resourcePath, []byte("zip"), 0o640); err != nil {
		t.Fatal(err)
	}
	resource := model.Resource{ID: "resource-delivery", UserID: "user-1", Kind: "file", Status: model.ResourceStatusReady, Provider: "local", ObjectKey: objectKey, Size: 3}
	job := model.ProjectDeliveryJob{ID: "delivery-1", UserID: "user-1", ProjectID: "project-1", UnitID: "unit-1", Status: model.ProjectDeliveryJobStatusSucceeded, ResourceID: resource.ID, ExpiresAt: ptr(now.Add(-time.Minute)), CreatedAt: now.Add(-time.Hour)}
	if err := db.Create(&resource).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&job).Error; err != nil {
		t.Fatal(err)
	}

	svc.cleanupExpiredProjectDeliveryJobs(10)
	var storedJob model.ProjectDeliveryJob
	if err := db.First(&storedJob, "id = ?", job.ID).Error; err != nil {
		t.Fatal(err)
	}
	if storedJob.Status != model.ProjectDeliveryJobStatusExpired || storedJob.ResourceID != "" {
		t.Fatalf("expired job = %#v", storedJob)
	}
	if err := db.First(&model.Resource{}, "id = ?", resource.ID).Error; !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("resource error = %v", err)
	}
	if _, err := os.Stat(resourcePath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("delivery file stat error = %v", err)
	}
}
