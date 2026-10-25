package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func TestDramaRuntimePollsDownloadsWithAuthAndPreservesUsage(t *testing.T) {
	allowLoopbackProviderTest(t)
	a, ok := loadOfficialFallbackRegistry().Resolve("drama-seedance-a")
	if !ok {
		t.Fatal("plugin unavailable")
	}
	creates, polls, downloads := 0, 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("authorization missing")
			w.WriteHeader(401)
			return
		}
		switch r.Method + " " + r.URL.Path {
		case "POST /v1/videos":
			creates++
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if body["model"] != "seedance2.5-A" || body["seconds"] != float64(30) || body["resolution"] != "720p" || len(body) != 5 {
				t.Errorf("body=%#v", body)
			}
			fmt.Fprint(w, `{"id":"task_public","task_id":"wrong","status":"queued","metadata":{"url":"https://invalid.example/early"}}`)
		case "GET /v1/videos/task_public":
			polls++
			switch polls {
			case 1:
				w.WriteHeader(503)
				fmt.Fprint(w, `{"message":"busy"}`)
			case 2:
				fmt.Fprint(w, `{"id":"task_public","status":"in_progress"}`)
			default:
				fmt.Fprint(w, `{"id":"task_public","status":"completed","metadata":{"url":"https://invalid.example/unused"},"usage":{"total_tokens":173699}}`)
			}
		case "GET /v1/videos/task_public/content":
			downloads++
			if polls < 3 {
				t.Error("downloaded before completion")
			}
			w.Header().Set("Content-Type", "video/mp4")
			fmt.Fprint(w, "video-test")
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	policy := protocolAdapterPollPolicy("video", a)
	if policy.Interval != 15*time.Second || policy.TransientRetryLimit != 3 || policy.RetryTransient {
		t.Fatalf("policy=%#v", policy)
	}
	policy.Sleep = func(context.Context, time.Duration) error { return nil }
	input := canvasGenerationInput{Mode: "video", Prompt: "city", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "seedance2.5-A", InterfaceType: "drama-seedance-a", Size: "16:9", VQuality: "720p", VideoSeconds: "30"}}
	result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, a, policy)
	if err != nil || result["mode"] != "video" || creates != 1 || polls != 3 || downloads != 1 {
		t.Fatalf("result=%#v err=%v calls=%d/%d/%d", result, err, creates, polls, downloads)
	}
	if usage, ok := result["usage"].(map[string]any); !ok || usage["total_tokens"] != float64(173699) {
		t.Fatalf("usage lost: %#v", result)
	}
	ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, providerAnalyticsContext{ProviderRequestID: "task_public"})
	input.Prompt = ""
	if _, err := runProtocolAdapterTaskWithPolicy(ctx, input, a, policy); err != nil {
		t.Fatal(err)
	}
	if creates != 1 || polls != 4 || downloads != 2 {
		t.Fatalf("recovery calls=%d/%d/%d", creates, polls, downloads)
	}
	encoded, _ := json.Marshal(input)
	task := model.Task{Type: "canvas_video", ProviderRequestID: "task_public"}
	if !(&Service{}).shouldDeferProviderTask(task, string(encoded), context.DeadlineExceeded) {
		t.Fatal("accepted task not resumable")
	}
	task.ProviderRequestID = ""
	if (&Service{}).shouldDeferProviderTask(task, string(encoded), context.DeadlineExceeded) {
		t.Fatal("task without upstream ID must not defer")
	}
}

func TestDramaRuntimeCreationAndTaskFailuresAreNotReplayed(t *testing.T) {
	allowLoopbackProviderTest(t)
	a, _ := loadOfficialFallbackRegistry().Resolve("drama-seedance-a")
	for _, scenario := range []string{"quota", "failed_task"} {
		t.Run(scenario, func(t *testing.T) {
			creates, polls, downloads := 0, 0, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.Method + " " + r.URL.Path {
				case "POST /v1/videos":
					creates++
					if scenario == "quota" {
						w.WriteHeader(402)
						fmt.Fprint(w, `{"code":"quota","message":"insufficient quota"}`)
					} else {
						fmt.Fprint(w, `{"id":"task_public","status":"queued"}`)
					}
				case "GET /v1/videos/task_public":
					polls++
					fmt.Fprint(w, `{"status":"failed","error":{"message":"media rejected"}}`)
				default:
					downloads++
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "video", Prompt: "city", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "seedance2.0-A", InterfaceType: "drama-seedance-a", Size: "16:9", VQuality: "720p", VideoSeconds: "5"}}
			policy := protocolAdapterPollPolicy("video", a)
			policy.Sleep = func(context.Context, time.Duration) error { return nil }
			if _, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, a, policy); err == nil || creates != 1 || downloads != 0 {
				t.Fatalf("err=%v calls=%d/%d/%d", err, creates, polls, downloads)
			}
		})
	}
}

func TestDramaRuntimeGeminiUsesJSONWithReferencesAndDecodesResult(t *testing.T) {
	allowLoopbackProviderTest(t)
	a, _ := loadOfficialFallbackRegistry().Resolve("drama-gemini-image")
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v1/images/generations" || r.Header.Get("Content-Type") != "application/json" || r.Header.Get("Authorization") != "Bearer test-key" {
			t.Errorf("request %s headers=%v", r.URL.Path, r.Header)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if body["quality"] != "high" || body["stream"] != false || body["resolution"] != nil || len(body["images"].([]any)) != 1 {
			t.Errorf("body=%#v", body)
		}
		fmt.Fprint(w, `{"data":[{"b64_json":"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT1kAAAAASUVORK5CYII="}]}`)
	}))
	defer server.Close()
	input := canvasGenerationInput{Mode: "image", Prompt: "draw", ReferenceImages: []providerMedia{{URL: "https://cdn.example/ref.png"}}, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "nano-banana-2", InterfaceType: "drama-gemini-image", Size: "16:9", ImageResolution: "4k", Count: "1"}}
	result, err := runProtocolAdapterTask(context.Background(), input, a)
	if err != nil || result["mode"] != "image" || calls != 1 {
		t.Fatalf("result=%#v err=%v calls=%d", result, err, calls)
	}
}

func TestDramaVideoCanvasReferenceRolesUseAJSON(t *testing.T) {
	a, _ := loadOfficialFallbackRegistry().Resolve("drama-seedance-a")
	for _, scenario := range []string{"standard_references", "newer_references", "standard_frames", "newer_frames"} {
		t.Run(scenario, func(t *testing.T) {
			input := canvasGenerationInput{Mode: "video", Prompt: "@图片1 @图2 @视频1 @音频1", Config: providerConfig{Model: "seedance2.0-A", InterfaceType: "drama-seedance-a", Size: "16:9", VQuality: "4K", VideoSeconds: "8"}, ReferenceImages: []providerMedia{{ID: "first", URL: "https://cdn.example/first.png"}, {ID: "last", URL: "https://cdn.example/last.png"}}}
			if strings.HasPrefix(scenario, "newer") {
				input.Config.Model, input.Config.VQuality, input.Config.VideoSeconds = "seedance2.5-A", "720p", "30"
			}
			frames := strings.HasSuffix(scenario, "frames")
			if frames {
				input.Metadata = map[string]any{"videoStartFrameNodeId": "first", "videoEndFrameNodeId": "last"}
				if input.Config.Model == "seedance2.0-A" {
					input.Config.Size = "Auto"
				}
			} else {
				input.ReferenceVideos = []providerMedia{{URL: "https://cdn.example/video.mp4"}}
				input.ReferenceAudios = []providerMedia{{URL: "https://cdn.example/audio.mp3"}}
			}
			spec, err := a.BuildCreate(context.Background(), protocol.RequestContext{Request: protocolRequestFromInput(input)})
			if err != nil {
				t.Fatal(err)
			}
			encoded, _ := json.Marshal(spec.Body)
			var body map[string]any
			json.Unmarshal(encoded, &body)
			if spec.Path != "/v1/videos" || spec.ContentType != "application/json" || len(spec.Files) != 0 || body["resolution"] != input.Config.VQuality || body["aspect_ratio"] != input.Config.Size {
				t.Fatalf("wrong A transport: %#v", spec)
			}
			refs := body["references"].([]any)
			wantRoles := []string{"reference", "reference", "reference", "reference"}
			if frames {
				wantRoles = []string{"first_frame", "last_frame"}
			}
			if len(refs) != len(wantRoles) {
				t.Fatalf("references=%#v", refs)
			}
			for i, role := range wantRoles {
				if refs[i].(map[string]any)["role"] != role {
					t.Fatalf("incorrect reference role: %#v", refs)
				}
			}
			for _, field := range []string{"images", "image", "input_reference", "generate_audio", "watermark"} {
				if _, exists := body[field]; exists {
					t.Fatalf("unexpected A field %s", field)
				}
			}
		})
	}
}

func TestDramaDefaultsMatchModelVersions(t *testing.T) {
	image := DefaultImageCapabilityConfig("drama-image", "")
	if image.References.MaskSupported || image.OutputFormat.Supported || image.TransparentBackground.Supported || image.MaxOutputs != 128 {
		t.Fatalf("image=%#v", image)
	}
	for _, test := range []struct {
		name                string
		max, images, videos int
	}{{"seedance2.0-A", 15, 9, 3}, {"seedance2.5-A", 30, 30, 10}} {
		v := DefaultModelCapabilityConfigForModel("drama-seedance-a", test.name).Video
		if v.Duration.Min != 4 || v.Duration.Max != test.max || v.References.MaxImages != test.images || v.References.MaxVideos != test.videos || v.GenerateAudio.Supported || v.Watermark.Supported {
			t.Fatalf("video=%#v", v)
		}
	}
	for _, name := range []string{"seedance2.0-fast-A", "seedance2.0-Mini-A"} {
		v := DefaultModelCapabilityConfigForModel("drama-seedance-a", name).Video
		if len(v.Resolutions) != 0 || v.DefaultResolution != "" || v.References.MaxImages != 0 || v.References.MaxVideos != 0 {
			t.Fatalf("unverified defaults=%#v", v)
		}
	}
}
