package storage

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"yingce/backend/internal/outbound"
)

// DirectUploadPost grants one exact object and size, never general bucket access.
type DirectUploadPost struct {
	URL       string            `json:"url"`
	Fields    map[string]string `json:"fields"`
	ExpiresAt time.Time         `json:"expiresAt"`
}

func SignAliyunUploadPost(setting Settings, key, mimeType string, size int64, expires time.Time) (*DirectUploadPost, error) {
	setting = NormalizeSettings(setting)
	if setting.Provider != aliyunOSSProvider || key == "" || size <= 0 || !expires.After(time.Now()) || setting.AccessKeyID == "" || setting.AccessKeySecret == "" {
		return nil, errors.New("直传授权参数无效")
	}
	base, err := OssBucketBaseURL(setting)
	if err != nil {
		return nil, err
	}
	fields := map[string]string{"key": key, "success_action_status": "204", "x-oss-content-type": mimeType, "x-oss-forbid-overwrite": "true"}
	conditions := []any{map[string]string{"bucket": setting.Bucket}, []any{"content-length-range", size, size}}
	if setting.SessionToken != "" {
		fields["x-oss-security-token"] = setting.SessionToken
	}
	for k, v := range fields {
		conditions = append(conditions, map[string]string{k: v})
	}
	policy, err := json.Marshal(map[string]any{"expiration": expires.UTC().Format(time.RFC3339), "conditions": conditions})
	if err != nil {
		return nil, err
	}
	encoded := base64.StdEncoding.EncodeToString(policy)
	mac := hmac.New(sha1.New, []byte(setting.AccessKeySecret))
	_, _ = mac.Write([]byte(encoded))
	fields["OSSAccessKeyId"], fields["policy"], fields["Signature"] = setting.AccessKeyID, encoded, base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return &DirectUploadPost{URL: base.String(), Fields: fields, ExpiresAt: expires}, nil
}

// InspectAliyunUpload reads at most a MIME signature, never the full media body.
func InspectAliyunUpload(setting Settings, key string, size int64, sampleBytes int) ([]byte, string, error) {
	end := min(size, int64(sampleBytes)) - 1
	if end < 0 {
		return nil, "", errors.New("上传文件不能为空")
	}
	req, err := NewOSSRequest(http.MethodGet, setting, key, "", nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Range", fmt.Sprintf("bytes=0-%d", end))
	resp, err := outbound.OutboundHTTPClient(transferTimeout(setting)).Do(req)
	if err != nil {
		return nil, "", errors.New("暂时无法核对 OSS 文件，请重试完成确认")
	}
	defer resp.Body.Close()
	expectedRange := fmt.Sprintf("bytes 0-%d/%d", end, size)
	if resp.StatusCode != http.StatusPartialContent || resp.Header.Get("Content-Range") != expectedRange || resp.ContentLength != end+1 {
		return nil, "", errors.New("OSS 文件尚未上传完整或大小不一致，请重试上传")
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, end+2))
	if err != nil || len(data) != int(end+1) || resp.Header.Get("ETag") == "" {
		return nil, "", errors.New("OSS 文件校验失败，请重试完成确认")
	}
	return data, resp.Header.Get("ETag"), nil
}
