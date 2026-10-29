package app

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"yingce/backend/internal/model"
)

const mediaStagingBudget int64 = 512 << 20
const mediaStagingTTL = 24 * time.Hour

// 单次结果下载的时限：上游慢但一直在传输时允许跑完，长时间收不到任何字节才判定卡住。
// 原来的固定 3 分钟总时限会让慢速结果服务器上的大图永远下载不完——每次重试都从零开始，
// 又在差不多同一位置超时。总时限仍有上限，避免一个下载长期占住有限的保存并发槽位。
var (
	mediaDownloadMaxDuration  = 15 * time.Minute
	mediaDownloadStallTimeout = 90 * time.Second
)

// errMediaDownloadStalled 包装 DeadlineExceeded，保证停滞与总超时一样按可重试的保存失败处理。
var errMediaDownloadStalled = fmt.Errorf("结果下载长时间没有进度：%w", context.DeadlineExceeded)

// mediaDownloadProgress 每收到一段数据就重置停滞计时。
type mediaDownloadProgress struct {
	reader io.Reader
	stall  *time.Timer
}

func (p mediaDownloadProgress) Read(buffer []byte) (int, error) {
	n, err := p.reader.Read(buffer)
	if n > 0 {
		p.stall.Reset(mediaDownloadStallTimeout)
	}
	return n, err
}

// mediaDownloadError 把停滞看门狗触发的取消还原成可识别的停滞错误；其他取消（任务租约失效、
// 服务停止）保持原样，不能被误判成上游问题。
func mediaDownloadError(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); errors.Is(cause, errMediaDownloadStalled) {
		return cause
	}
	return err
}

// mediaDownloadLogError 是写进请求明细的脱敏原因：不含地址与签名，只区分卡住、超时与其他失败。
func mediaDownloadLogError(err error) error {
	switch {
	case errors.Is(err, errMediaDownloadStalled):
		return errors.New("结果下载长时间没有进度")
	case errors.Is(err, context.DeadlineExceeded):
		return errors.New("结果下载超时")
	default:
		return errors.New("结果下载失败")
	}
}

var mediaStagingMu sync.Mutex

// Reserve the maximum response size before opening a file. Temporary files are
// sparse reservations, so concurrent downloads cannot oversubscribe this budget.
func (s *Service) newMediaTemp(limit int64) (*os.File, error) {
	mediaStagingMu.Lock()
	defer mediaStagingMu.Unlock()
	dir := filepath.Join(s.dataDir, "media-staging")
	if err := os.MkdirAll(dir, 0700); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var used int64
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), "result-") || !entry.Type().IsRegular() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if time.Since(info.ModTime()) > mediaStagingTTL {
			if err := os.Remove(filepath.Join(dir, entry.Name())); err != nil {
				return nil, err
			}
			continue
		}
		used += info.Size()
	}
	if limit <= 0 || limit > mediaStagingBudget || used > mediaStagingBudget-limit {
		return nil, errors.New("作品暂存空间不足，请稍后重试保存")
	}
	file, err := os.CreateTemp(dir, "result-*")
	if err != nil {
		return nil, err
	}
	if err := file.Truncate(limit); err != nil {
		file.Close()
		os.Remove(file.Name())
		return nil, err
	}
	return file, nil
}

func (s *Service) stageInlineMedia(data []byte) (string, error) {
	if len(data) == 0 {
		return "", errors.New("上游返回空作品")
	}
	file, err := s.newMediaTemp(int64(len(data)))
	if err != nil {
		return "", err
	}
	_, err = file.Write(data)
	if err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		os.Remove(file.Name())
		return "", err
	}
	return filepath.Base(file.Name()), nil
}

func (s *Service) downloadTaskMedia(ctx context.Context, config providerConfig, url, mode string) (name, mimeType string, err error) {
	policy, err := s.RuntimePolicy()
	if err != nil {
		return "", "", err
	}
	limit := min(megabytes(policy.Resource.GeneratedFileMB), mediaStagingBudget)
	deadlineCtx, cancelDeadline := context.WithTimeout(withProviderRequestKind(ctx, "download"), mediaDownloadMaxDuration)
	defer cancelDeadline()
	downloadCtx, cancelStalled := context.WithCancelCause(deadlineCtx)
	defer cancelStalled(nil)
	stall := time.AfterFunc(mediaDownloadStallTimeout, func() { cancelStalled(errMediaDownloadStalled) })
	defer stall.Stop()
	req, err := http.NewRequestWithContext(downloadCtx, http.MethodGet, url, nil)
	if err != nil {
		return "", "", err
	}
	started := time.Now()
	statusCode := 0
	defer func() {
		// Signed paths and net/url errors can contain bearer credentials. Keep
		// the real error for retry classification, never in request logs.
		logged := req.Clone(req.Context())
		redactedURL := *req.URL
		redactedURL.Path, redactedURL.RawPath, redactedURL.RawQuery, redactedURL.Fragment = "/task-media", "", "", ""
		redactedURL.User = nil
		logged.URL = &redactedURL
		var safeErr error
		if err != nil {
			safeErr = mediaDownloadLogError(err)
		}
		recordProviderRequest(logged, started, statusCode, nil, safeErr)
	}()
	if _, err = ValidateOutboundURL(url); err != nil {
		return "", "", err
	}
	if sameProviderOrigin(config.BaseURL, url) {
		applyProviderAuth(req, config)
		ApplyOutboundHeaders(req, config.Headers)
	}
	ApplyDefaultOutboundHeaders(req)
	// 结果文件可能托管在渠道同域（sameProviderOrigin 时还带渠道鉴权），
	// 渠道配置了出站代理时下载必须走同一代理，否则配代理渠道的结果无法取回。
	proxyURL := ""
	if metadata, ok := ctx.Value(providerAnalyticsKey{}).(providerAnalyticsContext); ok {
		proxyURL = metadata.ProxyURL
	}
	if strings.TrimSpace(proxyURL) == "" && strings.TrimSpace(config.ChannelID) != "" {
		if ch, err := s.repo.SystemChannel(config.ChannelID); err == nil {
			proxyURL = ch.ProxyURL
		}
	}
	// 客户端总时限与上下文一致；真正决定何时放弃的是停滞看门狗。
	response, err := OutboundHTTPClientWithProxy(mediaDownloadMaxDuration, proxyURL).Do(req)
	if err != nil {
		return "", "", mediaDownloadError(downloadCtx, err)
	}
	defer response.Body.Close()
	statusCode = response.StatusCode
	if statusCode < 200 || statusCode >= 300 {
		return "", "", providerHTTPError{StatusCode: statusCode, Status: response.Status, RetryAfter: parseRetryAfter(response.Header.Get("Retry-After"), time.Now())}
	}
	if response.ContentLength > limit {
		return "", "", errors.New("生成文件超过大小限制")
	}
	if response.ContentLength > 0 {
		limit = response.ContentLength
	}
	file, err := s.newMediaTemp(limit)
	if err != nil {
		return "", "", err
	}
	defer func() {
		_ = file.Close()
		if err != nil {
			_ = os.Remove(file.Name())
		}
	}()
	size, err := io.Copy(file, io.LimitReader(mediaDownloadProgress{reader: response.Body, stall: stall}, limit+1))
	if err != nil {
		return "", "", mediaDownloadError(downloadCtx, err)
	}
	if size == 0 || size > limit {
		return "", "", errors.New("生成文件为空或超过大小限制")
	}
	if response.ContentLength >= 0 && size != response.ContentLength {
		return "", "", io.ErrUnexpectedEOF
	}
	if err = file.Truncate(size); err != nil {
		return "", "", err
	}
	if _, err = file.Seek(0, io.SeekStart); err != nil {
		return "", "", err
	}
	head := make([]byte, min(size, 512))
	if _, err = io.ReadFull(file, head); err != nil {
		return "", "", err
	}
	mimeType = normalizedMediaMimeType(response.Header.Get("Content-Type"), head)
	if mode == "audio" && mimeType == "application/ogg" {
		mimeType = "audio/ogg"
	}
	if !strings.HasPrefix(mimeType, mode+"/") {
		return "", "", errors.New("上游返回的内容不是有效的" + mode + "媒体")
	}
	if err = file.Sync(); err != nil {
		return "", "", err
	}
	if err = file.Close(); err != nil {
		return "", "", err
	}
	return filepath.Base(file.Name()), mimeType, nil
}

func mediaUploadKey(taskID string, index int) *string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("task-media:%s:%d", taskID, index)))
	key := hex.EncodeToString(sum[:])
	return &key
}

func (s *Service) storeTaskMediaFile(task *model.Task, index int, path, mimeType, kind string, existing *model.Resource) (*model.Resource, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("暂存作品不是普通文件")
	}
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("暂存作品不是普通文件")
	}
	width, height := 0, 0
	durationMs := int64(0)
	if kind == "image" {
		config, _, err := image.DecodeConfig(file)
		if err != nil {
			// The standard library does not decode WebP/AVIF. Verify their
			// container signatures instead of trusting a response MIME header.
			head := make([]byte, 64)
			n, _ := file.ReadAt(head, 0)
			head = head[:n]
			webp := mimeType == "image/webp" && n >= 12 && string(head[:4]) == "RIFF" && string(head[8:12]) == "WEBP"
			avif := mimeType == "image/avif" && n >= 16 && string(head[4:8]) == "ftyp" && (strings.Contains(string(head[8:]), "avif") || strings.Contains(string(head[8:]), "avis"))
			if !webp && !avif {
				return nil, fmt.Errorf("图片内容校验失败：%w", err)
			}
		}
		width, height = config.Width, config.Height
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			return nil, err
		}
	} else if kind == "audio" || kind == "video" {
		// Audio and video-processing duration is the source of truth for per-second
		// settlement. The media can still be saved when ffprobe is unavailable;
		// settlement then falls back to provider usage or moves the order to review.
		durationMs = probeMediaDurationMs(path)
	}
	day, err := s.reserveGeneratedResourceQuota(task.UserID, info.Size())
	if err != nil {
		return nil, err
	}
	committed := false
	defer func() {
		if !committed {
			s.releaseUserUploadQuota(task.UserID, day, info.Size())
		}
	}()
	var resource *model.Resource
	if existing == nil {
		resource, _, err = s.storeResourceWithWriter(task.UserID, kind, "generated."+extensionFromMimeType(mimeType), mimeType, info.Size(), width, height, durationMs, file, mediaUploadKey(task.ID, index), false, s.storeTaskMediaObject)
	} else {
		// Reuse the same object key after a failed upload; no orphan per retry.
		resource = existing
		if resource.UserID != task.UserID || resource.Size != info.Size() || resource.MimeType != mimeType {
			return nil, errors.New("恢复文件与原始资源不一致")
		}
		resource.DurationMs = durationMs
		resource.ETag, err = s.storeTaskMediaObject(resource, "generated."+extensionFromMimeType(mimeType), file)
		if err == nil {
			resource.Status, resource.Error, resource.UpdatedAt = model.ResourceStatusReady, "", time.Now()
			err = s.saveResourceWithinStorageLimit(resource, "")
		}
	}
	if err != nil {
		return nil, err
	}
	s.commitUserUploadQuota(task.UserID, info.Size())
	committed = true
	if existing != nil {
		s.recordActivity(task.UserID, "resource", 1)
		s.maybeStartPlaybackTranscode(resource)
	}
	return resource, nil
}

func probeMediaDurationMs(path string) int64 {
	if strings.TrimSpace(path) == "" {
		return 0
	}
	if _, err := exec.LookPath("ffprobe"); err != nil {
		return 0
	}
	output, err := exec.Command("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path).Output()
	if err != nil {
		return 0
	}
	seconds, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil || seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		return 0
	}
	return int64(math.Ceil(seconds * 1000))
}

// Unlike ordinary uploads, generated output preserves an OSS failure for
// explicit recovery instead of silently changing the storage destination.
func (s *Service) storeTaskMediaObject(resource *model.Resource, _ string, body io.Reader) (string, error) {
	if resource.Provider == "local" {
		return "", writeLocalResourceObject(filepath.Join(s.dataDir, "resources", filepath.FromSlash(resource.ObjectKey)), body)
	}
	setting, err := s.ossSettingForResource(resource.UserID, resource)
	if err != nil {
		return "", err
	}
	return putOSSObject(s.storageSettingWithRuntimePolicy(setting), resource.ObjectKey, resource.MimeType, resource.Size, body)
}

// Cleanup is best effort only after durable completion. Expired leftovers are
// also collected on staging allocation, never by deleting resource objects.
func (s *Service) cleanupMediaCheckpointFiles(task *model.Task) {
	checkpoint, err := s.decodeMediaCheckpoint(task)
	if err != nil {
		return
	}
	for _, item := range checkpoint.Items {
		if path := s.mediaTempPath(item.TempName); path != "" {
			if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
				_ = s.log(task.UserID, task.ID, "warn", "清理作品暂存文件失败", "")
			}
		}
	}
}
