package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestYezonghuiImageRequestUsesStrictFiveFieldContract(t *testing.T) {
	a := officialPackageAdapter(t, "yezonghui.yingce-plugin", "yezonghui-image")
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Capability: CapabilityImage, Model: "GPT-image-2", Prompt: " change style ", AspectRatio: "1:1", Resolution: "1080p", ImageCount: 1,
		Quality: "high", Duration: 10, Watermark: true,
		Images:          []MediaReference{{URL: "https://cdn.example/second.png", Order: 2}, {URL: "https://cdn.example/first.png", Order: 1}},
		ProviderOptions: map[string]map[string]any{"yezonghui-image": {"n": 4, "size": "2048x2048", "quality": "high"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Path != "/v1/images" || spec.ContentType != "application/json" || spec.Auth.Type != "bearer" || spec.Auth.Field != "apiKey" {
		t.Fatalf("spec = %#v", spec)
	}
	want := map[string]any{"model": "GPT-image-2", "prompt": "change style", "ratio": "1:1", "resolution": "1080p", "image_urls": []any{"https://cdn.example/first.png", "https://cdn.example/second.png"}}
	if got := manifestTestBody(t, spec); !reflect.DeepEqual(got, want) {
		t.Fatalf("body = %#v, want %#v", got, want)
	}
	if !a.Metadata().RequiresPublicMediaURLs || a.Metadata().Polling.IntervalSeconds != 15 {
		t.Fatalf("metadata = %#v", a.Metadata())
	}
}

func TestYezonghuiVideoUsesDocumentedJSONAndAudioFields(t *testing.T) {
	a := officialPackageAdapter(t, "yezonghui.yingce-plugin", "yezonghui-video")
	for _, audio := range []bool{false, true} {
		spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
			Model: "dreamina-seedance-2.0", Prompt: "@图片1 @视频1 @音频1", Duration: 10, AspectRatio: "16:9", Resolution: "1080P", GenerateAudio: audio,
			Images: []MediaReference{{URL: "https://cdn.example/ref.png"}}, Videos: []MediaReference{{URL: "https://cdn.example/ref.mp4"}}, Audios: []MediaReference{{URL: "https://cdn.example/ref.mp3"}},
			ProviderOptions: map[string]map[string]any{"yezonghui-video": {"seed": 0, "fps": 24, "camera_fixed": false, "negative_prompt": "blur", "metadata": map[string]any{"custom": "value"}, "generate_audio": true, "n": 2, "body": map[string]any{"bad": true}}},
		}})
		if err != nil {
			t.Fatal(err)
		}
		b := manifestTestBody(t, spec)
		if spec.Path != "/v1/videos" || spec.ContentType != "application/json" || b["seconds"] != "10" || b["size"] != "16:9" || b["resolution"] != "1080p" || b["audio"] != audio || b["camera_fixed"] != false || b["seed"] != float64(0) {
			t.Fatalf("spec = %#v body = %#v", spec, b)
		}
		for _, key := range []string{"generate_audio", "input", "parameters", "images", "n", "body", "aspect_ratio", "duration", "resolution_name"} {
			if _, ok := b[key]; ok {
				t.Fatalf("unexpected field %s in %#v", key, b)
			}
		}
		for _, key := range []string{"image_urls", "video_urls", "audio_urls"} {
			if items, ok := b[key].([]any); !ok || len(items) != 1 {
				t.Fatalf("%s = %#v", key, b[key])
			}
		}
	}
}

func TestYezonghuiRejectsInvalidInputsBeforeSubmission(t *testing.T) {
	for _, id := range []string{"yezonghui-image", "yezonghui-video"} {
		a := officialPackageAdapter(t, "yezonghui.yingce-plugin", id)
		cases := map[string]func(*GenerationRequest){
			"empty_model":        func(r *GenerationRequest) { r.Model = " " },
			"empty_prompt":       func(r *GenerationRequest) { r.Prompt = " " },
			"missing_resolution": func(r *GenerationRequest) { r.Resolution = "" },
			"auto_resolution":    func(r *GenerationRequest) { r.Resolution = " AUTO " },
			"pixel_ratio":        func(r *GenerationRequest) { r.AspectRatio = "1920x1080" },
			"auto_ratio":         func(r *GenerationRequest) { r.AspectRatio = "auto" },
			"zero_ratio":         func(r *GenerationRequest) { r.AspectRatio = "0:1" },
			"base64_image":       func(r *GenerationRequest) { r.Images = []MediaReference{{DataURL: "data:image/png;base64,eA=="}} },
			"local_path":         func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "/tmp/reference.png"}} },
		}
		if id == "yezonghui-image" {
			cases["multiple_outputs"] = func(r *GenerationRequest) { r.ImageCount = 2 }
			cases["mask"] = func(r *GenerationRequest) {
				r.Images = []MediaReference{{URL: "https://cdn.example/mask.png", Role: "mask"}}
			}
			cases["video_reference"] = func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://cdn.example/ref.mp4"}} }
			cases["audio_reference"] = func(r *GenerationRequest) { r.Audios = []MediaReference{{URL: "https://cdn.example/ref.mp3"}} }
		} else {
			cases["missing_duration"] = func(r *GenerationRequest) { r.Duration = 0 }
			cases["long_duration"] = func(r *GenerationRequest) { r.Duration = 3601 }
			cases["base64_audio"] = func(r *GenerationRequest) { r.Audios = []MediaReference{{DataURL: "data:audio/mp3;base64,eA=="}} }
		}
		for name, mutate := range cases {
			t.Run(id+"/"+name, func(t *testing.T) {
				r := GenerationRequest{Model: "model", Prompt: "prompt", Resolution: "1080p", AspectRatio: "16:9", Duration: 10}
				mutate(&r)
				if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatal("invalid request accepted")
				}
			})
		}
	}
}

func TestYezonghuiAsyncStatesAndAuthenticatedContent(t *testing.T) {
	for _, kind := range []string{"image", "video"} {
		a := officialPackageAdapter(t, "yezonghui.yingce-plugin", "yezonghui-"+kind)
		created, err := a.ParseCreate(context.Background(), []byte(`{"id":"task_1","task_id":"wrong","status":"queued"}`))
		if err != nil || created.TaskID != "task_1" || created.Status != StatusPending {
			t.Fatalf("created = %#v err=%v", created, err)
		}
		c := PollContext{TaskID: "task_1"}
		for status, want := range map[string]Status{"queued": StatusPending, "in_progress": StatusProcessing, "completed": StatusSucceeded, "failed": StatusFailed, "unknown": StatusPending, "future_state": StatusPending, "success": StatusPending} {
			payload, _ := json.Marshal(map[string]any{"id": "task_1", "status": status, "url": "https://cdn.example/unused", "data": map[string]any{"status": "FAILED"}})
			state, err := a.ParsePoll(context.Background(), c, payload)
			if err != nil || state.Status != want {
				t.Fatalf("%s/%s state = %#v err=%v", kind, status, state, err)
			}
			if state.Result != nil && len(state.Result.Images)+len(state.Result.Videos) > 0 {
				t.Fatal("result must use authenticated content, not a temporary URL")
			}
		}
		for _, payload := range []string{`{"code":"invalid_resolution","message":"allowed values: 1080p","data":null}`, `{"error":{"code":"invalid_api_key","message":"invalid key"}}`, `{"id":"task_1","status":"failed","error":{"message":"generation failed"}}`} {
			state, err := a.ParsePoll(context.Background(), c, []byte(payload))
			if err != nil || state.Status != StatusFailed || state.Message == "" {
				t.Fatalf("error response = %#v err=%v", state, err)
			}
		}
		result, err := a.(ResultAdapter).BuildResult(context.Background(), c)
		wantPath := "/v1/" + kind + "s/task_1/content"
		if err != nil || result.Method != "GET" || result.Path != wantPath || result.Auth.Type != "bearer" {
			t.Fatalf("download = %#v err=%v", result, err)
		}
	}
}

func TestYezonghuiChatPreservesConversationAndToolCalls(t *testing.T) {
	a := officialPackageAdapter(t, "yezonghui.yingce-plugin", "yezonghui-chat")
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "chat-model", Instructions: "system", Messages: []Message{{Role: "user", Content: "old"}, {Role: "assistant", Content: "reply"}}, Prompt: "new"}})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if len(b["messages"].([]any)) != 4 || spec.Path != "/v1/chat/completions" || a.Metadata().StreamingFormat != "chat-completion" {
		t.Fatalf("chat = %#v", spec)
	}
	agent := a.(AgentAdapter)
	call, err := agent.ParseAgent(context.Background(), []byte(`{"choices":[{"message":{"content":null,"tool_calls":[{"id":"call_1","type":"function","function":{"name":"generate_image","arguments":"{\"prompt\":\"cat\"}"}}]}}]}`))
	if err != nil || len(call.ToolCalls) != 1 || call.ToolCalls[0].ID != "call_1" || call.ToolCalls[0].Name != "generate_image" {
		t.Fatalf("tool call = %#v err=%v", call, err)
	}
}

func TestYezonghuiSourceMatchesDistribution(t *testing.T) {
	root := filepath.Join("..", "..", "..", "plugin-packages")
	data, err := os.ReadFile(filepath.Join(root, "yezonghui.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"manifest.json", "README.md", "docs/interface.md"} {
		source, err := os.ReadFile(filepath.Join(root, "yezonghui", name))
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(source, pkg.Files[name]) {
			t.Fatalf("package differs from source: %s", name)
		}
	}
}

func TestYezonghuiHostDeclarationsRejectInvalidPolicies(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "yezonghui", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	for name, mutate := range map[string]func(*Manifest){
		"unknown_stream_format": func(m *Manifest) { m.Contributes.Providers[0].StreamingFormat = "unknown" },
		"media_stream_format":   func(m *Manifest) { m.Contributes.Providers[1].StreamingFormat = "chat-completion" },
		"zero_interval":         func(m *Manifest) { m.Contributes.Providers[1].Polling.IntervalSeconds = 0 },
		"unbounded_retries":     func(m *Manifest) { m.Contributes.Providers[1].Polling.TransientRetryLimit = 11 },
		"missing_poll_endpoint": func(m *Manifest) { m.Contributes.Providers[1].Poll = nil },
	} {
		t.Run(name, func(t *testing.T) {
			var manifest Manifest
			if err := json.Unmarshal(data, &manifest); err != nil {
				t.Fatal(err)
			}
			mutate(&manifest)
			if err := ValidateManifest(manifest); err == nil {
				t.Fatal("invalid declaration accepted")
			}
		})
	}
}
