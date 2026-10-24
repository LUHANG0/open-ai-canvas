package protocol

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestFourSTokenImageUsesAsyncJSONAndMultipartEdits(t *testing.T) {
	a := officialPackageAdapter(t, "4stoken.yingce-plugin", "4stoken-image")
	r := GenerationRequest{Capability: CapabilityImage, Model: "model", Prompt: "draw", AspectRatio: "1024x1024", ImageCount: 2, Quality: "high", Resolution: "2K"}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Path != "/v1/images/generations" || spec.ContentType != "application/json" || len(spec.Files) != 0 {
		t.Fatalf("generation = %#v", spec)
	}
	want := map[string]any{"model": "model", "prompt": "draw", "n": float64(2), "size": "1024x1024", "async": true}
	if b := manifestTestBody(t, spec); !reflect.DeepEqual(b, want) {
		t.Fatalf("body=%#v want=%#v", b, want)
	}
	r.Images = []MediaReference{{DataURL: "data:image/png;base64,eA==", Role: "edit_source", Order: 2, Name: "second.png"}, {DataURL: "data:image/png;base64,eQ==", Role: "edit_source", Order: 1, Name: "first.png"}, {DataURL: "data:image/png;base64,eg==", Role: "mask", Order: 3}}
	r.ProviderOptions = map[string]map[string]any{"4stoken-image": {"style": "vivid", "output_format": "webp"}}
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	if spec.Path != "/v1/images/edits" || spec.ContentType != "multipart/form-data" || len(spec.Files) != 3 {
		t.Fatalf("edit=%#v", spec)
	}
	if spec.Files[0].Name != "image" || spec.Files[0].Reference.Name != "first.png" || spec.Files[1].Name != "image" || spec.Files[2].Name != "mask" {
		t.Fatalf("files=%#v", spec.Files)
	}
	b := manifestTestBody(t, spec)
	for _, key := range []string{"quality", "resolution", "style", "images", "image_urls", "callbackUrl", "response_format"} {
		if _, ok := b[key]; ok {
			t.Fatalf("unexpected edit field %s=%#v", key, b[key])
		}
	}
	if b["output_format"] != "webp" {
		t.Fatalf("body=%#v", b)
	}
}

func TestFourSTokenGatewayStatesResultsAndErrors(t *testing.T) {
	for _, kind := range []string{"image", "video"} {
		a := officialPackageAdapter(t, "4stoken.yingce-plugin", "4stoken-"+kind)
		created, err := a.ParseCreate(context.Background(), []byte(`{"task_id":"local-task","taskId":"local-task","id":"wrong-upstream","status":"pending"}`))
		if err != nil || created.TaskID != "local-task" || created.Status != StatusPending {
			t.Fatalf("created=%#v err=%v", created, err)
		}
		c := PollContext{TaskID: "local-task"}
		poll, err := a.BuildPoll(context.Background(), c)
		path := "/v1/videos/local-task"
		if kind == "image" {
			path = "/v1/images/tasks/local-task"
		}
		if err != nil || poll.Path != path || poll.Auth.Type != "bearer" {
			t.Fatalf("poll=%#v err=%v", poll, err)
		}
		for status, want := range map[string]Status{"pending": StatusPending, "running": StatusProcessing, "succeeded": StatusSucceeded, "failed": StatusFailed, "canceled": StatusCancelled, "future": StatusPending} {
			state, err := a.ParsePoll(context.Background(), c, []byte(`{"task_id":"local-task","status":"`+status+`"}`))
			if err != nil || state.Status != want {
				t.Fatalf("%s/%s state=%#v err=%v", kind, status, state, err)
			}
		}
		for _, payload := range []string{`{"status":"failed","error":"failed reason"}`, `{"error":{"code":"quota_exceeded","message":"quota"}}`} {
			state, err := a.ParsePoll(context.Background(), c, []byte(payload))
			if err != nil || state.Status != StatusFailed || state.Message == "" {
				t.Fatalf("state=%#v err=%v", state, err)
			}
		}
		if a.(ResultCapability).ResultAvailable() {
			t.Fatal("Gateway does not declare a content endpoint")
		}
	}
	image := officialPackageAdapter(t, "4stoken.yingce-plugin", "4stoken-image")
	for _, payload := range []string{`{"task_id":"i","status":"succeeded","data":[{"url":"https://cdn.example/image.png"}]}`, `{"task_id":"i","status":"succeeded","result":{"data":[{"url":"https://cdn.example/image.png"}]}}`, `{"task_id":"i","data":[{"url":"https://cdn.example/image.png"}]}`} {
		state, err := image.ParseCreate(context.Background(), []byte(payload))
		if err != nil || state.Status != StatusSucceeded || state.Result == nil || len(state.Result.Images) != 1 || !state.Result.Images[0].Ephemeral {
			t.Fatalf("image=%#v err=%v", state, err)
		}
	}
	video := officialPackageAdapter(t, "4stoken.yingce-plugin", "4stoken-video")
	for _, key := range []string{"video_url", "url"} {
		state, err := video.ParsePoll(context.Background(), PollContext{TaskID: "v"}, []byte(`{"taskId":"v","status":"succeeded","data":[{"`+key+`":"https://cdn.example/video.mp4"}],"usage":{"completion_tokens":12}}`))
		if err != nil || state.Status != StatusSucceeded || len(state.Result.Videos) != 1 || state.Result.Videos[0].URL != "https://cdn.example/video.mp4" || state.Result.Usage["completion_tokens"] != float64(12) {
			t.Fatalf("video=%#v err=%v", state, err)
		}
	}
}

func TestFourSTokenVideoSeparatesReferencesAndFrames(t *testing.T) {
	a := officialPackageAdapter(t, "4stoken.yingce-plugin", "4stoken-video")
	r := GenerationRequest{Model: "model", Prompt: "move", Duration: 6, AspectRatio: "16:9", Resolution: "720p", GenerateAudio: true, Watermark: false, Images: []MediaReference{{URL: "https://cdn.example/start.png", Role: "first_frame"}}}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/v1/videos" || spec.ContentType != "application/json" || b["image_url"] != "https://cdn.example/start.png" || b["aspect_ratio"] != "16:9" || b["resolution"] != "720p" || b["duration"] != float64(6) || b["generate_audio"] != true || b["watermark"] != false {
		t.Fatalf("body=%#v", b)
	}
	for _, key := range []string{"seconds", "size", "audio", "input_reference", "input", "parameters"} {
		if _, ok := b[key]; ok {
			t.Fatalf("wrong field %s", key)
		}
	}
	r.Images = append(r.Images, MediaReference{URL: "https://cdn.example/end.png", Role: "last_frame"})
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b = manifestTestBody(t, spec)
	if b["start_image_url"] != "https://cdn.example/start.png" || b["end_image_url"] != "https://cdn.example/end.png" || b["image_url"] != nil || b["content"] != nil {
		t.Fatalf("paired=%#v", b)
	}
	r.Videos = []MediaReference{{URL: "https://cdn.example/ref.mp4"}}
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("paired frames mixed with video accepted")
	}
	r.Images = []MediaReference{{URL: "https://cdn.example/second.png", Order: 2}, {URL: "https://cdn.example/first.png", Order: 1}}
	r.Audios = []MediaReference{{URL: "https://cdn.example/ref.mp3"}}
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b = manifestTestBody(t, spec)
	content := b["content"].([]any)
	if len(content) != 5 || b["prompt"] != nil || b["image_url"] != nil || content[1].(map[string]any)["image_url"].(map[string]any)["url"] != "https://cdn.example/first.png" || content[4].(map[string]any)["role"] != "reference_audio" {
		t.Fatalf("mixed=%#v", b)
	}
	r.Images = []MediaReference{{URL: "data:image/png;base64,eA=="}}
	r.Videos = nil
	r.Audios = nil
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("inline video reference accepted")
	}
}

func TestFourSTokenSeedreamUsesNativeContractAndCombinedLimit(t *testing.T) {
	a := officialPackageAdapter(t, "4stoken.yingce-plugin", "4stoken-seedream")
	r := GenerationRequest{Model: "seedream", Prompt: "draw", AspectRatio: "2048x2048", ImageCount: 3, Images: []MediaReference{{DataURL: "data:image/png;base64,eA=="}}, ProviderOptions: map[string]map[string]any{"4stoken-seedream": {"watermark": false}}}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/api/v3/images/generations" || b["response_format"] != "url" || b["stream"] != false || b["watermark"] != false || b["sequential_image_generation"] != "auto" {
		t.Fatalf("body=%#v", b)
	}
	r.ImageCount = 15
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("reference + output limit ignored")
	}
	r.ImageCount = 1
	r.AspectRatio = "16:9"
	if _, err = a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("ratio sent as native size")
	}
}

func TestFourSTokenTextProfilesKeepDistinctContracts(t *testing.T) {
	for _, test := range []struct{ id, path, wire, field string }{{"4stoken-chat", "/v1/chat/completions", "chat-completion", "messages"}, {"4stoken-responses", "/v1/responses", "responses", "input"}, {"4stoken-claude", "/v1/messages", "claude-api", "messages"}} {
		a := officialPackageAdapter(t, "4stoken.yingce-plugin", test.id)
		spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{Model: "model", Prompt: "new", Instructions: "system", Messages: []Message{{Role: "user", Content: "old"}}}})
		if err != nil {
			t.Fatal(err)
		}
		if spec.Path != test.path || spec.Auth.Type != "bearer" || a.Metadata().StreamingFormat != test.wire || manifestTestBody(t, spec)[test.field] == nil {
			t.Fatalf("%s spec=%#v", test.id, spec)
		}
		if !a.(AgentCapability).AgentAvailable() {
			t.Fatalf("missing Agent support: %s", test.id)
		}
	}
}

func TestFourSTokenDistributionMatchesSource(t *testing.T) {
	root := filepath.Join("..", "..", "..", "plugin-packages")
	data, err := os.ReadFile(filepath.Join(root, "4stoken.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	if len(pkg.Manifest.Contributes.Providers) != 6 {
		t.Fatal("expected six distinct profiles")
	}
	for _, name := range []string{"manifest.json", "README.md", "docs/interface.md"} {
		source, err := os.ReadFile(filepath.Join(root, "4stoken", name))
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(source, pkg.Files[name]) {
			t.Fatalf("stale package file: %s", name)
		}
	}
}
