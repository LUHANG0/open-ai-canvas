package app

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestDirectUploadLifecycle(t *testing.T) {
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	s, db := newResourceFallbackTestService(t)
	if err := db.AutoMigrate(&model.UserDailyActivity{}, &model.UserDailyUploadUsage{}); err != nil {
		t.Fatal(err)
	}
	png := mediaTestPNG(t)
	stored := []byte(nil)
	reads, writes := 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			writes++
			w.WriteHeader(500)
			return
		}
		reads++
		if len(stored) == 0 {
			w.WriteHeader(404)
			return
		}
		end := min(len(stored), directUploadSampleBytes) - 1
		if r.Header.Get("Range") != fmt.Sprintf("bytes=0-%d", min(len(png), directUploadSampleBytes)-1) {
			t.Error("not a bounded validation read")
		}
		w.Header().Set("Content-Range", fmt.Sprintf("bytes 0-%d/%d", end, len(stored)))
		w.Header().Set("Content-Length", fmt.Sprint(end+1))
		w.Header().Set("ETag", `"uploaded-etag"`)
		w.WriteHeader(206)
		_, _ = w.Write(stored[:end+1])
	}))
	defer server.Close()
	seedOSSEnabled(t, db, "user", server.URL)
	req := DirectUploadRequest{FileName: "image.png", Size: int64(len(png)), Sample: base64.StdEncoding.EncodeToString(png[:min(len(png), directUploadSampleBytes)]), Width: 2, Height: 3}
	grant, err := s.BeginDirectResourceUpload("user", req, "logical")
	if err != nil || grant.Mode != "direct" || grant.Post.Fields["x-oss-forbid-overwrite"] != "true" {
		t.Fatalf("grant=%+v error=%v", grant, err)
	}
	encoded, _ := json.Marshal(grant)
	if strings.Contains(string(encoded), "sk-plaintext") {
		t.Fatal("secret leaked")
	}
	duplicate, err := s.BeginDirectResourceUpload("user", req, "logical")
	if err != nil || duplicate.UploadID != grant.UploadID {
		t.Fatalf("duplicate admission: %+v %v", duplicate, err)
	}
	day := time.Now().UTC().Format("2006-01-02")
	if used, err := s.repo.DailyUploadBytes("user", day); err != nil || used != req.Size {
		t.Fatalf("reserved quota=%d err=%v", used, err)
	}
	if _, err := s.CompleteDirectResourceUpload("other", grant.UploadID); err == nil {
		t.Fatal("cross account completion accepted")
	}
	if _, err := s.CompleteDirectResourceUpload("user", grant.UploadID); err == nil {
		t.Fatal("missing object accepted")
	}
	stored = []byte(strings.Repeat("x", len(png)))
	if _, err := s.CompleteDirectResourceUpload("user", grant.UploadID); err == nil {
		t.Fatal("spoofed content accepted")
	}
	stored = append(png, byte(0))
	if _, err := s.CompleteDirectResourceUpload("user", grant.UploadID); err == nil {
		t.Fatal("wrong size accepted")
	}
	stored = png
	resource, err := s.CompleteDirectResourceUpload("user", grant.UploadID)
	if err != nil || resource.Status != model.ResourceStatusReady || resource.MimeType != "image/png" || resource.ETag != "uploaded-etag" || resource.Error != "" {
		t.Fatalf("complete=%+v err=%v", resource, err)
	}
	readCount := reads
	for i := 0; i < 2; i++ {
		again, err := s.CompleteDirectResourceUpload("user", grant.UploadID)
		if err != nil || again.ID != resource.ID {
			t.Fatalf("idempotent completion: %v", err)
		}
	}
	if reads != readCount || writes != 0 {
		t.Fatalf("backend performed %d writes, %d unnecessary reads", writes, reads-readCount)
	}
	if used, _ := s.repo.DailyUploadBytes("user", day); used != req.Size {
		t.Fatalf("double charged %d", used)
	}
	ready, err := s.BeginDirectResourceUpload("user", req, "logical")
	if err != nil || ready.Mode != "ready" || ready.Resource.ID != resource.ID {
		t.Fatalf("ready retry: %+v %v", ready, err)
	}
}

func TestDirectUploadAdmissionLimitsAndLocalMode(t *testing.T) {
	s, db := newResourceFallbackTestService(t)
	if grant, err := s.BeginDirectResourceUpload("user", DirectUploadRequest{}, ""); err != nil || grant.Mode != "server" {
		t.Fatalf("local fallback: %+v %v", grant, err)
	}
	if err := db.AutoMigrate(&model.UserDailyUploadUsage{}); err != nil {
		t.Fatal(err)
	}
	seedOSSEnabled(t, db, "user", "https://oss.example.com")
	for _, req := range []DirectUploadRequest{{FileName: "test", Size: 1, Sample: "bad"}, {FileName: "test", Size: 1 << 50, Sample: base64.StdEncoding.EncodeToString(make([]byte, 3072))}} {
		if _, err := s.BeginDirectResourceUpload("user", req, ""); err == nil {
			t.Fatal("invalid upload admitted")
		}
	}
}
