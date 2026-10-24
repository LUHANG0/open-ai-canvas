package protocol

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func dramaVideoRequest() GenerationRequest {
	return GenerationRequest{Model: "seedance2.0-A", Prompt: "@图1 @视频1 @音频1", Duration: 6, AspectRatio: "16:9", Resolution: "720p"}
}

func TestDramaVideoStrictJSONAndOrderedReferences(t *testing.T) {
	a := officialPackageAdapter(t, "drama-api.yingce-plugin", "drama-seedance-a")
	r := dramaVideoRequest()
	r.Images = []MediaReference{{URL: "https://cdn.example/second.png", Order: 2}, {URL: "https://cdn.example/first.png", Order: 1}}
	r.Videos = []MediaReference{{URL: "https://cdn.example/motion.mp4"}}
	r.Audios = []MediaReference{{URL: "https://cdn.example/voice.mp3"}}
	r.GenerateAudio, r.Watermark = true, true
	r.ProviderOptions = map[string]map[string]any{"drama-seedance-a": {"seed": 7, "generate_audio": true, "body": map[string]any{"unsafe": true}}}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/v1/videos" || spec.ContentType != "application/json" || spec.Auth.Type != "bearer" || len(b) != 6 || b["seconds"] != float64(6) || b["aspect_ratio"] != "16:9" || b["resolution"] != "720p" {
		t.Fatalf("spec=%#v body=%#v", spec, b)
	}
	refs := b["references"].([]any)
	for i, want := range []struct{ kind, source string }{{"image", "https://cdn.example/first.png"}, {"image", "https://cdn.example/second.png"}, {"video", "https://cdn.example/motion.mp4"}, {"audio", "https://cdn.example/voice.mp3"}} {
		item := refs[i].(map[string]any)
		if item["type"] != want.kind || item["source"] != want.source || item["role"] != "reference" || len(item) != 3 {
			t.Fatalf("reference=%#v", item)
		}
	}
	r.Resolution = "4k"
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil || manifestTestBody(t, spec)["resolution"] != "4K" {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
}

func TestDramaVideoVersionsFramesAndLimits(t *testing.T) {
	a := officialPackageAdapter(t, "drama-api.yingce-plugin", "drama-seedance-a")
	cases := []struct {
		name   string
		mutate func(*GenerationRequest)
		valid  bool
	}{
		{"standard", func(r *GenerationRequest) {}, true},
		{"standard_too_long", func(r *GenerationRequest) { r.Duration = 16 }, false},
		{"newer_long", func(r *GenerationRequest) { r.Model = "seedance2.5-A"; r.Duration = 30 }, true},
		{"newer_too_long", func(r *GenerationRequest) { r.Model = "seedance2.5-A"; r.Duration = 31 }, false},
		{"newer_1080p", func(r *GenerationRequest) { r.Model = "seedance2.5-A"; r.Resolution = "1080p" }, false},
		{"newer_auto", func(r *GenerationRequest) { r.Model = "seedance2.5-A"; r.AspectRatio = "Auto" }, false},
		{"other_series", func(r *GenerationRequest) { r.Model = "seedance2.0-B" }, false},
		{"missing_resolution", func(r *GenerationRequest) { r.Resolution = "" }, false},
		{"mask", func(r *GenerationRequest) {
			r.Images = []MediaReference{{URL: "https://cdn.example/mask.png", Role: "mask"}}
		}, false},
		{"http", func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "http://cdn.example/ref.mp4"}} }, false},
		{"inline", func(r *GenerationRequest) { r.Images = []MediaReference{{DataURL: "data:image/png;base64,eA=="}} }, false},
		{"first_only", func(r *GenerationRequest) {
			r.Images = []MediaReference{{URL: "https://cdn.example/f.png", Role: "first_frame"}}
			r.AspectRatio = "Auto"
		}, false},
		{"paired", func(r *GenerationRequest) {
			r.Images = []MediaReference{{URL: "https://cdn.example/f.png", Role: "first_frame"}, {URL: "https://cdn.example/l.png", Role: "last_frame"}}
			r.AspectRatio = "auto"
		}, true},
		{"paired_wrong_ratio", func(r *GenerationRequest) {
			r.Images = []MediaReference{{URL: "https://cdn.example/f.png", Role: "first_frame"}, {URL: "https://cdn.example/l.png", Role: "last_frame"}}
		}, false},
		{"mixed_frames", func(r *GenerationRequest) {
			r.Images = []MediaReference{{URL: "https://cdn.example/f.png", Role: "first_frame"}, {URL: "https://cdn.example/l.png", Role: "last_frame"}}
			r.Videos = []MediaReference{{URL: "https://cdn.example/v.mp4"}}
			r.AspectRatio = "Auto"
		}, false},
		{"total_limit", func(r *GenerationRequest) {
			for i := 0; i < 9; i++ {
				r.Images = append(r.Images, MediaReference{URL: "https://cdn.example/i.png"})
			}
			for i := 0; i < 3; i++ {
				r.Videos = append(r.Videos, MediaReference{URL: "https://cdn.example/v.mp4"})
			}
			r.Audios = []MediaReference{{URL: "https://cdn.example/a.mp3"}}
		}, false},
		{"newer_expanded_refs", func(r *GenerationRequest) {
			r.Model = "seedance2.5-A"
			for i := 0; i < 30; i++ {
				r.Images = append(r.Images, MediaReference{URL: "https://cdn.example/i.png"})
			}
		}, true},
		{"newer_ref_limit", func(r *GenerationRequest) {
			r.Model = "seedance2.5-A"
			for i := 0; i < 31; i++ {
				r.Images = append(r.Images, MediaReference{URL: "https://cdn.example/i.png"})
			}
		}, false},
		{"fast", func(r *GenerationRequest) { r.Model = "seedance2.0-fast-A" }, true},
		{"mini", func(r *GenerationRequest) { r.Model = "seedance2.0-Mini-A" }, true},
	}
	for _, test := range cases {
		t.Run(test.name, func(t *testing.T) {
			r := dramaVideoRequest()
			test.mutate(&r)
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v err=%v", test.valid, err)
			}
			if test.name == "paired" && err == nil && manifestTestBody(t, spec)["aspect_ratio"] != "Auto" {
				t.Fatal("Auto casing lost")
			}
		})
	}
}

func TestDramaVideoStatesUsePublicIDAndAuthenticatedContent(t *testing.T) {
	a := officialPackageAdapter(t, "drama-api.yingce-plugin", "drama-seedance-a")
	created, err := a.ParseCreate(context.Background(), []byte(`{"id":"task_public","task_id":"wrong","status":"queued","metadata":{"url":"https://cdn.example/early"}}`))
	if err != nil || created.TaskID != "task_public" || created.Status != StatusPending || created.Result != nil {
		t.Fatalf("created=%#v err=%v", created, err)
	}
	for status, want := range map[string]Status{"queued": StatusPending, "in_progress": StatusProcessing, "completed": StatusSucceeded, "failed": StatusFailed, "unknown": StatusPending, "succeeded": StatusPending} {
		state, err := a.ParsePoll(context.Background(), PollContext{TaskID: "task_public"}, []byte(`{"status":"`+status+`","metadata":{"url":"https://cdn.example/unused"},"usage":{"total_tokens":123}}`))
		if err != nil || state.TaskID != "task_public" || state.Status != want || state.Result == nil || state.Result.Usage["total_tokens"] != float64(123) || len(state.Result.Videos) != 0 {
			t.Fatalf("state=%#v err=%v", state, err)
		}
	}
	for _, payload := range []string{`{"code":"invalid_request","message":"bad request"}`, `{"status":"failed","error":"bad media"}`, `{"error":{"code":"quota","message":"no quota"}}`} {
		state, err := a.ParseCreate(context.Background(), []byte(payload))
		if err != nil || state.Status != StatusFailed || state.Message == "" {
			t.Fatalf("state=%#v err=%v", state, err)
		}
	}
	poll, err := a.BuildPoll(context.Background(), PollContext{TaskID: "task_public"})
	if err != nil || poll.Path != "/v1/videos/task_public" {
		t.Fatalf("poll=%#v err=%v", poll, err)
	}
	content, err := a.(ResultAdapter).BuildResult(context.Background(), PollContext{TaskID: "task_public"})
	if err != nil || content.Path != "/v1/videos/task_public/content" || content.Auth.Type != "bearer" {
		t.Fatalf("content=%#v err=%v", content, err)
	}
}

func TestDramaImageReferencesStayOnSynchronousJSONEndpoint(t *testing.T) {
	a := officialPackageAdapter(t, "drama-api.yingce-plugin", "drama-image")
	r := GenerationRequest{Model: "gpt-image-2", Prompt: "draw", ImageCount: 2, AspectRatio: "1792x1024", Quality: "high", Resolution: "4K", Images: []MediaReference{{URL: "https://cdn.example/ref.png"}}}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]any{"model": "gpt-image-2", "prompt": "draw", "n": float64(2), "size": "1792x1024", "quality": "high", "images": []any{map[string]any{"image_url": "https://cdn.example/ref.png"}}, "response_format": "url", "stream": false}
	if spec.Path != "/v1/images/generations" || spec.ContentType != "application/json" || len(spec.Files) != 0 || !reflect.DeepEqual(manifestTestBody(t, spec), want) {
		t.Fatalf("spec=%#v body=%#v", spec, manifestTestBody(t, spec))
	}
	for _, payload := range []string{`{"data":[{"url":"https://cdn.example/result.png"}]}`, `{"data":[{"b64_json":"eA=="}]}`} {
		state, err := a.ParseCreate(context.Background(), []byte(payload))
		if err != nil || state.Status != StatusSucceeded || len(state.Result.Images) != 1 {
			t.Fatalf("state=%#v err=%v", state, err)
		}
	}
	r.Images[0].Role = "mask"
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("mask accepted")
	}
}

func TestDramaDistributionAndChatContract(t *testing.T) {
	root := filepath.Join("..", "..", "..", "plugin-packages")
	data, err := os.ReadFile(filepath.Join(root, "drama-api.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(pkg.Manifest.Contributes.Providers) != 4 {
		t.Fatal("expected exactly four providers")
	}
	for _, name := range []string{"manifest.json", "README.md", "docs/interface.md"} {
		source, err := os.ReadFile(filepath.Join(root, "drama-api", name))
		if err != nil || !reflect.DeepEqual(source, pkg.Files[name]) {
			t.Fatalf("stale package: %s err=%v", name, err)
		}
	}
	a := officialPackageAdapter(t, "drama-api.yingce-plugin", "drama-chat")
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "chat", Prompt: "new", Instructions: "system", Messages: []Message{{Role: "user", Content: "old"}}}})
	if err != nil || spec.Path != "/v1/chat/completions" || a.Metadata().StreamingFormat != "chat-completion" || len(manifestTestBody(t, spec)["messages"].([]any)) != 3 || !a.(AgentCapability).AgentAvailable() {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
}
