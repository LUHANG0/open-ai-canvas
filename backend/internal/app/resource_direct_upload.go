package app

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/gabriel-vasile/mimetype"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/storage"
)

const directUploadSampleBytes = 3072
const directUploadTTL = 30 * time.Minute
const directUploadCompletionTTL = 45 * time.Minute
const directUploadMarker = "direct-upload:"

type DirectUploadRequest struct {
	FileName   string `json:"fileName"`
	Size       int64  `json:"size"`
	Sample     string `json:"sample"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	DurationMs int64  `json:"durationMs"`
}

type DirectUploadResult struct {
	Mode     string                    `json:"mode"`
	UploadID string                    `json:"uploadId,omitempty"`
	Post     *storage.DirectUploadPost `json:"post,omitempty"`
	Resource *model.Resource           `json:"resource,omitempty"`
}

func (s *Service) BeginDirectResourceUpload(userID string, req DirectUploadRequest, identity string) (*DirectUploadResult, error) {
	if userID == "" {
		return nil, Unauthorized("请先登录")
	}
	setting, locationID, enabled, err := s.activeResourceOSSSetting(userID)
	if err != nil {
		return nil, err
	}
	if !enabled || setting.Provider != aliyunOSSProvider {
		return &DirectUploadResult{Mode: "server"}, nil
	}
	if req.FileName == "" || len(req.FileName) > 255 || req.Size <= 0 || req.Width < 0 || req.Height < 0 || req.DurationMs < 0 {
		return nil, BadAuthRequest("上传文件信息无效")
	}
	sample, err := base64.StdEncoding.DecodeString(req.Sample)
	if err != nil || len(sample) != int(min(req.Size, int64(directUploadSampleBytes))) {
		return nil, BadAuthRequest("文件类型校验数据不完整")
	}
	mimeType := strings.Split(mimetype.Detect(sample).String(), ";")[0]
	kind := uploadedResourceKind(mimeType)
	digest := sha256.Sum256(sample)
	marker := directUploadMarker + hex.EncodeToString(digest[:])
	uploadKey := normalizedResourceUploadKey([]string{identity})
	existing, err := s.resourceForUploadKey(userID, uploadKey)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if err := validateResourceUploadIdentity(existing, kind, mimeType, req.Size); err != nil {
			return nil, err
		}
		if existing.Status == model.ResourceStatusReady {
			return &DirectUploadResult{Mode: "ready", Resource: existing}, nil
		}
		if existing.Error != marker || existing.Status != model.ResourceStatusPending {
			return nil, resourceUploadInProgress()
		}
		if !time.Now().Before(existing.CreatedAt.Add(directUploadTTL)) {
			jobs := resourceDeletionJobs(userID, map[string]*model.Resource{resourceStorageIdentity(existing): existing})
			// The old grant has expired. Delay physical deletion for requests that
			// were already in flight; the next grant always uses a fresh object key.
			jobs[0].NextAttemptAt = time.Now().Add(time.Hour)
			if err := s.repo.RetireDirectUpload(existing, &jobs[0]); err != nil {
				return nil, err
			}
			return s.BeginDirectResourceUpload(userID, req, identity)
		}
		return s.directUploadGrant(existing)
	}
	if locationID == "" {
		location, err := s.upsertStorageLocation("platform", "", setting)
		if err != nil {
			return nil, err
		}
		locationID = location.ID
	}
	now := time.Now()
	r := &model.Resource{ID: newID(), UserID: userID, Kind: kind, Status: model.ResourceStatusPending, Provider: setting.Provider,
		Endpoint: setting.Endpoint, Bucket: setting.Bucket, StorageSettingID: locationID,
		ObjectKey: ossObjectKey(setting, userID, kind, req.FileName, mimeType, now), MimeType: mimeType, Size: req.Size,
		Width: req.Width, Height: req.Height, DurationMs: req.DurationMs, UploadKey: uploadKey, Error: marker, CreatedAt: now, UpdatedAt: now}
	if err := s.ReserveChunkUploadSession(userID, r.ID, r.Size, now.Add(directUploadCompletionTTL), 32); err != nil {
		return nil, err
	}
	if err := s.repo.CreateResource(r); err != nil {
		releaseErr := s.ReleaseChunkUploadSession(userID, r.ID)
		if releaseErr != nil {
			return nil, errors.Join(err, releaseErr)
		}
		// A concurrent admission with the same identity owns the only grant.
		if current, lookupErr := s.resourceForUploadKey(userID, uploadKey); lookupErr == nil && current != nil {
			return s.BeginDirectResourceUpload(userID, req, identity)
		}
		return nil, err
	}
	return s.directUploadGrant(r)
}

func (s *Service) directUploadGrant(r *model.Resource) (*DirectUploadResult, error) {
	if !time.Now().Before(r.CreatedAt.Add(directUploadTTL)) {
		return nil, resourceUploadInProgress()
	}
	setting, err := s.ossSettingForResource(r.UserID, r)
	if err != nil {
		return nil, err
	}
	post, err := storage.SignAliyunUploadPost(setting, r.ObjectKey, r.MimeType, r.Size, r.CreatedAt.Add(directUploadTTL))
	if err != nil {
		return nil, err
	}
	return &DirectUploadResult{Mode: "direct", UploadID: r.ID, Post: post}, nil
}

func (s *Service) CompleteDirectResourceUpload(userID, id string) (*model.Resource, error) {
	r, err := s.repo.ResourceForUser(userID, id)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, NotFound("上传会话不存在")
	}
	if err != nil {
		return nil, err
	}
	if r.Status == model.ResourceStatusReady {
		return r, nil
	}
	if r.Status != model.ResourceStatusPending || !strings.HasPrefix(r.Error, directUploadMarker) || !time.Now().Before(r.CreatedAt.Add(directUploadCompletionTTL)) {
		return nil, BadAuthRequest("上传会话已过期，请重新上传")
	}
	setting, err := s.ossSettingForResource(userID, r)
	if err != nil {
		return nil, err
	}
	sample, etag, err := storage.InspectAliyunUpload(s.storageSettingWithRuntimePolicy(setting), r.ObjectKey, r.Size, directUploadSampleBytes)
	if err != nil {
		return nil, NewAppError(502, err.Error())
	}
	digest := sha256.Sum256(sample)
	if r.Error != directUploadMarker+hex.EncodeToString(digest[:]) || r.MimeType != strings.Split(mimetype.Detect(sample).String(), ";")[0] {
		return nil, BadAuthRequest("上传文件内容与授权不一致")
	}
	before := *r
	r.Status, r.Error, r.ETag, r.UpdatedAt = model.ResourceStatusReady, "", strings.Trim(etag, "\""), time.Now()
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	saved, changed, err := s.repo.CompleteDirectUpload(&before, r, gigabytes(policy.Resource.StoredFileGB), megabytes(policy.Resource.DailyUploadMB))
	if err != nil {
		return nil, uploadReservationError(err)
	}
	if changed {
		s.recordActivity(userID, "resource", 1)
		s.maybeStartPlaybackTranscode(saved)
	}
	return saved, nil
}
