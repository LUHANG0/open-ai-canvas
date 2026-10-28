package app

import (
	"errors"
	"hash/crc64"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestTencentCOSConnectionTestUsesStorageEndpointInsteadOfCDN(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	var storageMethods []string
	storageServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		storageMethods = append(storageMethods, r.Method)
		if !strings.HasPrefix(r.URL.Path, "/open-ai-canvas/.yingce-tests/platform/") {
			t.Errorf("path = %q", r.URL.Path)
		}
		if !strings.Contains(r.Header.Get("Authorization"), "q-sign-algorithm=sha1") {
			t.Errorf("Authorization = %q", r.Header.Get("Authorization"))
		}
		switch r.Method {
		case http.MethodPut:
			payload, err := io.ReadAll(r.Body)
			if err != nil {
				t.Error(err)
			}
			if string(payload) != "yingce-storage-test" {
				t.Errorf("payload = %q", payload)
			}
			w.Header().Set("ETag", `"cos-test-etag"`)
			w.Header().Set("x-cos-hash-crc64ecma", strconv.FormatUint(crc64.Checksum(payload, crc64.MakeTable(crc64.ECMA)), 10))
		case http.MethodGet:
			if r.Header.Get("Range") != "bytes=0-3" {
				t.Errorf("Range = %q", r.Header.Get("Range"))
			}
			w.Header().Set("Accept-Ranges", "bytes")
			w.Header().Set("Content-Range", "bytes 0-3/19")
			w.WriteHeader(http.StatusPartialContent)
			_, _ = io.WriteString(w, "ying")
		case http.MethodDelete:
			w.WriteHeader(http.StatusNoContent)
		default:
			t.Errorf("unexpected method %s", r.Method)
		}
	}))
	defer storageServer.Close()

	cdnRequests := 0
	cdnServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		cdnRequests++
		http.Error(w, "CDN must not be used by storage connection tests", http.StatusBadGateway)
	}))
	defer cdnServer.Close()

	err := verifyOSSConnection(ossSettingValue{
		Provider:        tencentCOSProvider,
		Region:          "ap-guangzhou",
		Endpoint:        storageServer.URL,
		CDNBaseURL:      cdnServer.URL,
		Bucket:          "example-1250000000",
		AccessKeyID:     "secret-id",
		AccessKeySecret: "secret-key",
		PathPrefix:      defaultOSSPathPrefix,
	}, defaultOSSPathPrefix+"/.yingce-tests/platform/test-id")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(storageMethods, ",") != "PUT,GET,DELETE" {
		t.Fatalf("storage methods = %v", storageMethods)
	}
	if cdnRequests != 0 {
		t.Fatalf("CDN requests = %d", cdnRequests)
	}
}

func TestOSSConnectionReadAcceptsFullObjectWhenRangeIsIgnored(t *testing.T) {
	payload := []byte("yingce-storage-test")
	stream := &ossObjectStream{
		Body:          io.NopCloser(strings.NewReader(string(payload))),
		StatusCode:    http.StatusOK,
		ContentLength: int64(len(payload)),
	}
	if err := verifyOSSConnectionRead(stream, payload); err != nil {
		t.Fatal(err)
	}
}

func TestOSSConnectionReadRejectsUnexpectedContent(t *testing.T) {
	payload := []byte("yingce-storage-test")
	stream := &ossObjectStream{
		Body:          io.NopCloser(strings.NewReader("error page")),
		StatusCode:    http.StatusOK,
		ContentLength: 10,
	}
	err := verifyOSSConnectionRead(stream, payload)
	if err == nil {
		t.Fatal("verifyOSSConnectionRead() error = nil")
	}
	if !errors.Is(err, errOSSConnectionReadMismatch) {
		t.Fatalf("verifyOSSConnectionRead() error = %v", err)
	}
	publicErr := storageConnectionTestError(tencentCOSProvider, "Range 读取", err)
	var appErr *AppError
	if !errors.As(publicErr, &appErr) || !strings.Contains(appErr.Message, "忽略、改写了 Range 请求") {
		t.Fatalf("storageConnectionTestError() = %#v", publicErr)
	}
}

func TestTencentCOSConnectionTestReturnsActionableAuthError(t *testing.T) {
	t.Setenv("CANVAS_ALLOW_PRIVATE_UPSTREAMS", "true")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/xml")
		w.WriteHeader(http.StatusForbidden)
		_, _ = io.WriteString(w, `<Error><Code>SignatureDoesNotMatch</Code><Message>signature mismatch</Message><RequestId>request-id</RequestId></Error>`)
	}))
	defer server.Close()

	err := verifyOSSConnection(ossSettingValue{
		Provider:        tencentCOSProvider,
		Region:          "ap-guangzhou",
		Endpoint:        server.URL,
		Bucket:          "example-1250000000",
		AccessKeyID:     "secret-id",
		AccessKeySecret: "secret-key",
		PathPrefix:      defaultOSSPathPrefix,
	}, defaultOSSPathPrefix+"/.yingce-tests/platform/test-id")
	if err == nil {
		t.Fatal("verifyOSSConnection() error = nil")
	}
	var appErr *AppError
	if !errors.As(err, &appErr) {
		t.Fatalf("error type = %T, error = %v", err, err)
	}
	if appErr.Status != http.StatusBadGateway || !strings.Contains(appErr.Message, "腾讯云 COS 写入鉴权失败") {
		t.Fatalf("AppError = %#v", appErr)
	}
	if strings.Contains(appErr.Message, "secret-key") || strings.Contains(appErr.Message, "signature mismatch") {
		t.Fatalf("public error leaked upstream detail: %q", appErr.Message)
	}
}

func TestAliyunCNAMEHasDistinctLocationWithoutChangingLegacyDigest(t *testing.T) {
	base := ossSettingValue{Provider: "aliyun", Endpoint: "https://media.example.com", Bucket: "media-bucket", Region: "oss-cn-shenzhen", PathPrefix: "open-ai-canvas"}
	if got := storageLocationDigest(base); got != "60913d67310c8af98cbf9c257dd5db3203a8c7d0db70dfc63a0ea81e2d7f84b1" {
		t.Fatalf("legacy location digest changed: %s", got)
	}
	custom := base
	custom.IsCNAME = true
	if storageLocationDigest(base) == storageLocationDigest(custom) {
		t.Fatal("CNAME mode must be part of the immutable storage location identity")
	}
	if storageTestDigest(base) == storageTestDigest(custom) {
		t.Fatal("CNAME change must invalidate a previous connection test")
	}
}

func TestAliyunCNAMERequiresTestAndPinsEncryptedResourceLocation(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			_, _ = io.WriteString(w, "yingce-storage-test")
		}
	}))
	defer server.Close()
	svc, _ := newResourceFallbackTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	req := OSSSettingRequest{Enabled: true, Provider: "aliyun", Endpoint: server.URL, IsCNAME: true, Bucket: "media-bucket", AccessKeyID: "test-id", AccessKeySecret: "cname-test-private-secret", PathPrefix: "open-ai-canvas"}
	if _, err := svc.UpdateOSSSetting(admin, req); err == nil {
		t.Fatal("untested CNAME endpoint was activated")
	}
	if _, err := svc.TestAdminOSSSetting(admin, req); err != nil {
		t.Fatal(err)
	}
	saved, err := svc.UpdateOSSSetting(admin, req)
	if err != nil {
		t.Fatal(err)
	}
	if !saved.IsCNAME || saved.StorageLocationID == "" {
		t.Fatal("CNAME location was not persisted")
	}
	location, err := svc.repo.StorageLocation(saved.StorageLocationID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(location.ValueJSON, req.AccessKeySecret) {
		t.Fatal("storage location contains a plaintext secret")
	}
	req.IsCNAME = false
	if _, err := svc.UpdateOSSSetting(admin, req); err != nil {
		t.Fatal(err)
	}
	oldResource := &model.Resource{UserID: "user-1", Provider: "aliyun", Endpoint: server.URL, Bucket: req.Bucket, StorageSettingID: saved.StorageLocationID}
	historical, err := svc.ossSettingForResource("user-1", oldResource)
	if err != nil {
		t.Fatal(err)
	}
	if !historical.IsCNAME || historical.AccessKeySecret != req.AccessKeySecret {
		t.Fatal("historical CNAME resource lost its original signing configuration")
	}
}
