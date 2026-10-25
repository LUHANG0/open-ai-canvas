package app

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"yingce/backend/internal/protocol"
)

func TestDramaGPTLocalResourceUsesAuthenticatedBytes(t *testing.T) {
	svc, _, imageBytes := cloudAgentVisionFixture(t)
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "")
	input := canvasGenerationInput{Mode: "image", Prompt: "keep @图片1", Config: providerConfig{InterfaceType: "drama-image", Model: "gpt-image-2.5-sunburst"}, ReferenceImages: []providerMedia{{StorageKey: "resource:ref-one"}}}
	ctx := ensureOfficialProtocolAdapter(context.Background(), input.Config.InterfaceType)
	policy := providerMediaHydrationPolicyFor(ctx, input)
	if policy.requireURL || policy.preferURL {
		t.Fatal("multipart edits must hydrate reference bytes")
	}
	if err := svc.hydrateGenerationMedia("user", &input, policy); err != nil {
		t.Fatal(err)
	}
	want := dataURL("image/png", imageBytes)
	if input.ReferenceImages[0].DataURL != want || input.ReferenceImages[0].URL != "" {
		t.Fatal("reference bytes were not resolved from the authorized resource")
	}
	a, _ := declarativeProtocolAdapterForContext(ctx, input.Config.InterfaceType)
	spec, err := a.BuildCreate(ctx, protocol.RequestContext{Request: protocolRequestFromInput(input)})
	if err != nil || spec.Path != "/v1/images/edits" || len(spec.Files) != 1 || spec.Files[0].Reference.DataURL != want {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
	foreign := canvasGenerationInput{ReferenceImages: []providerMedia{{StorageKey: "resource:ref-one"}}}
	if err := svc.hydrateGenerationMedia("other-user", &foreign, policy); err == nil {
		t.Fatal("another user's resource was accepted")
	}
}

func TestDramaRuntimeGPTTextAndReferenceTransport(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, withReferences := range []bool{false, true} {
		t.Run(fmt.Sprintf("references_%v", withReferences), func(t *testing.T) {
			calls := 0
			png := mediaTestPNG(t)
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Header.Get("Authorization") != "Bearer test-key" || r.Method != "POST" {
					t.Error("missing authorization or wrong method")
				}
				if withReferences {
					if r.URL.Path != "/v1/images/edits" || !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
						t.Errorf("edit path=%s contentType=%s", r.URL.Path, r.Header.Get("Content-Type"))
					}
					if err := r.ParseMultipartForm(1 << 20); err != nil {
						t.Error(err)
						w.WriteHeader(400)
						return
					}
					defer r.MultipartForm.RemoveAll()
					if len(r.MultipartForm.File["image[]"]) != 2 || len(r.MultipartForm.File) != 1 {
						t.Errorf("files=%#v", r.MultipartForm.File)
					}
					for name, want := range map[string]string{"size": "3840x2160", "quality": "max", "n": "1", "response_format": "url", "model": "gpt-image-2.5-sunburst", "prompt": "based on the reference"} {
						if r.FormValue(name) != want {
							t.Errorf("field %s=%q want=%q", name, r.FormValue(name), want)
						}
					}
					for _, name := range []string{"images", "stream", "resolution", "mask"} {
						if _, present := r.MultipartForm.Value[name]; present {
							t.Errorf("unexpected field %s", name)
						}
					}
					for i, header := range r.MultipartForm.File["image[]"] {
						file, err := header.Open()
						if err != nil {
							t.Error(err)
							continue
						}
						data, err := io.ReadAll(file)
						file.Close()
						if err != nil || string(data) != string(png) || header.Filename != []string{"first.png", "second.png"}[i] {
							t.Errorf("incorrect image upload %q err=%v", header.Filename, err)
						}
					}
				} else {
					if r.URL.Path != "/v1/images/generations" || r.Header.Get("Content-Type") != "application/json" {
						t.Errorf("generation path=%s contentType=%s", r.URL.Path, r.Header.Get("Content-Type"))
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
					}
					if body["images"] != nil || body["resolution"] != nil || body["stream"] != false || body["quality"] != "max" || body["size"] != "3840x2160" {
						t.Errorf("body=%#v", body)
					}
				}
				fmt.Fprintf(w, `{"data":[{"b64_json":"%s"}]}`, strings.TrimPrefix(dataURL("image/png", png), "data:image/png;base64,"))
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "image", Prompt: "based on the reference", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-image-2.5-sunburst", InterfaceType: "drama-image", Size: "3840x2160", ImageResolution: "4k", Quality: "max", Count: "1"}}
			if withReferences {
				data := dataURL("image/png", png)
				input.ReferenceImages = []providerMedia{{DataURL: data, MimeType: "image/png", Name: "first.png"}, {DataURL: data, MimeType: "image/png", Name: "second.png"}}
			}
			a, _ := loadOfficialFallbackRegistry().Resolve("drama-image")
			result, err := runProtocolAdapterTask(context.Background(), input, a)
			if err != nil || result["mode"] != "image" || calls != 1 {
				t.Fatalf("result=%#v err=%v calls=%d", result, err, calls)
			}
		})
	}
}
