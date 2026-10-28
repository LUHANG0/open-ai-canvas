package storage

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestDirectUploadPostPolicy(t *testing.T) {
	setting := Settings{Provider: "aliyun", Endpoint: "https://media.example.com", IsCNAME: true, Bucket: "private", AccessKeyID: "id", AccessKeySecret: "private-secret"}
	post, err := SignAliyunUploadPost(setting, "open-ai-canvas/user/random.png", "image/png", 12345, time.Now().Add(time.Minute))
	if err != nil {
		t.Fatal(err)
	}
	if post.URL != "https://media.example.com" {
		t.Fatalf("custom domain changed: %s", post.URL)
	}
	data, _ := base64.StdEncoding.DecodeString(post.Fields["policy"])
	var policy struct {
		Conditions []json.RawMessage `json:"conditions"`
		Expiration time.Time         `json:"expiration"`
	}
	if err := json.Unmarshal(data, &policy); err != nil {
		t.Fatal(err)
	}
	for _, condition := range []string{`{"bucket":"private"}`, `{"key":"open-ai-canvas/user/random.png"}`, `["content-length-range",12345,12345]`, `{"x-oss-content-type":"image/png"}`, `{"x-oss-forbid-overwrite":"true"}`} {
		found := false
		for _, c := range policy.Conditions {
			if string(c) == condition {
				found = true
			}
		}
		if !found {
			t.Fatalf("missing constrained condition: %s", condition)
		}
	}
	mac := hmac.New(sha1.New, []byte(setting.AccessKeySecret))
	mac.Write([]byte(post.Fields["policy"]))
	if base64.StdEncoding.EncodeToString(mac.Sum(nil)) != post.Fields["Signature"] {
		t.Fatal("invalid signature")
	}
	encoded, _ := json.Marshal(post)
	if strings.Contains(string(encoded), setting.AccessKeySecret) {
		t.Fatal("long term secret leaked")
	}
}
