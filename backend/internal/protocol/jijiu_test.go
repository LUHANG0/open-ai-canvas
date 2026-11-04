package protocol

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestJijiuChatStandardTierAdmissionAndUsage(t *testing.T) {
	a := officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-chat")
	if !a.(AgentCapability).AgentAvailable() {
		t.Fatal("guarded chat must expose its Agent operation")
	}
	r := GenerationRequest{Model: "gpt-6.1-sol", Instructions: "system", Messages: []Message{{Role: "user", Content: "history"}}, Prompt: "hello"}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/v1/chat/completions" || len(b["messages"].([]any)) != 3 || b["max_tokens"] != float64(8192) || a.Metadata().StreamingFormat != "chat-completion" {
		t.Fatalf("invalid chat request: %#v", spec)
	}
	for _, tc := range []struct {
		name string
		edit func(*GenerationRequest)
	}{
		{"long prompt", func(r *GenerationRequest) { r.Prompt = strings.Repeat("界", 50001) }},
		{"long history", func(r *GenerationRequest) {
			r.Messages = []Message{{Role: "user", Content: strings.Repeat("x", 50001)}}
		}},
		{"visual history", func(r *GenerationRequest) {
			r.Messages = []Message{{Role: "user", Content: []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://cdn.example/image.png"}}}}}
		}},
		{"media", func(r *GenerationRequest) { r.Images = []MediaReference{{URL: "https://cdn.example/image.png"}} }},
		{"large output", func(r *GenerationRequest) { r.Extra = map[string]any{"max_tokens": 32001} }},
		{"unknown model", func(r *GenerationRequest) { r.Model = "not-a-chat-model" }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			request := r
			tc.edit(&request)
			if _, err := a.BuildCreate(context.Background(), RequestContext{Request: request}); err == nil {
				t.Fatal("out-of-contract chat accepted")
			}
		})
	}
	state, err := a.ParseCreate(context.Background(), []byte(`{"choices":[{"message":{"content":"hello"}}],"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":40}}}`))
	if err != nil || state.Status != StatusSucceeded || state.Result == nil {
		t.Fatalf("state=%#v err=%v", state, err)
	}
}

func TestJijiuAgentGuardsToolsHistoryAndOutput(t *testing.T) {
	a := officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-chat").(AgentAdapter)
	base := `{"chatCompletion":{"messages":[{"role":"system","content":"rules"},{"role":"user","content":[{"type":"text","text":"hello"}]},{"role":"assistant","content":null,"tool_calls":[{"id":"call-1","type":"function","function":{"name":"search","arguments":"{}"}}]},{"role":"tool","tool_call_id":"call-1","content":"found"}],"tools":[{"type":"function","function":{"name":"search","parameters":{"type":"object"}}}],"tool_choice":"required","parallel_tool_calls":true,"max_tokens":4096}}`
	build := func(edit func(map[string]any), model string) (RequestSpec, error) {
		var request map[string]any
		if err := json.Unmarshal([]byte(base), &request); err != nil {
			t.Fatal(err)
		}
		chat := request["chatCompletion"].(map[string]any)
		if edit != nil {
			edit(chat)
		}
		return a.BuildAgent(context.Background(), AgentRequestContext{Model: model, Request: request})
	}
	spec, err := build(nil, "gpt-6.1-sol")
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/v1/chat/completions" || b["max_tokens"] != float64(4096) || b["parallel_tool_calls"] != false || len(b["messages"].([]any)) != 4 || len(b["tools"].([]any)) != 1 || b["tool_choice"] != "required" {
		t.Fatalf("Agent request=%#v", b)
	}
	for _, tc := range []struct {
		name string
		edit func(map[string]any)
	}{
		{"system", func(c map[string]any) {
			c["messages"].([]any)[0].(map[string]any)["content"] = strings.Repeat("界", 50001)
		}},
		{"tool schema", func(c map[string]any) {
			c["tools"].([]any)[0].(map[string]any)["function"].(map[string]any)["description"] = strings.Repeat("x", 50001)
		}},
		{"tool result", func(c map[string]any) {
			c["messages"].([]any)[3].(map[string]any)["content"] = strings.Repeat("x", 50001)
		}},
		{"image", func(c map[string]any) {
			c["messages"].([]any)[1].(map[string]any)["content"] = []any{map[string]any{"type": "image_url", "image_url": map[string]any{"url": "https://example.com/x.png"}}}
		}},
		{"large output", func(c map[string]any) { c["max_tokens"] = 32001 }},
		{"fractional output", func(c map[string]any) { c["max_tokens"] = 1.5 }},
		{"negative output", func(c map[string]any) { c["max_tokens"] = -1 }},
		{"missing messages", func(c map[string]any) { delete(c, "messages") }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := build(tc.edit, "gpt-6.1-sol"); err == nil {
				t.Fatal("invalid Agent request accepted")
			}
		})
	}
	if _, err := build(nil, "unknown"); err == nil {
		t.Fatal("unknown model accepted")
	}
	result, err := a.ParseAgent(context.Background(), []byte(`{"choices":[{"message":{"tool_calls":[{"id":"call-1","function":{"name":"search","arguments":"{\"q\":\"hello\"}"}}]}}]}`))
	if err != nil || len(result.ToolCalls) != 1 || result.ToolCalls[0].ID != "call-1" || result.ToolCalls[0].Arguments != `{"q":"hello"}` {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func TestJijiuVideoLineContracts(t *testing.T) {
	a := officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-video")
	cases := []struct {
		model, resolution, videoKey, audioKey string
		min, max                              int
		omitResolution                        bool
	}{
		{"满血seedance-2.5全参C", "1080p", "video_refs", "audio_refs", 5, 30, true},
		{"稳定seedance-2.5全参D", "480p", "videos", "audios", 4, 30, false},
		{"稳定seedance-2.5参图参音F", "480p", "", "audios", 4, 30, true},
		{"官转seedance-2.0全参", "720p", "", "audios", 4, 15, false},
		{"官转seedance-2.5全参", "1080p", "", "audios", 4, 30, false},
		{"SD2.0满血稳定933-线路一", "720p", "", "audios", 5, 15, false},
		{"SD2.0满血稳定933-线路四", "480p", "videos", "audios", 4, 15, false},
		{"SD2.0特价稳定903z", "720p", "", "audios", 10, 15, true},
		{"SD2.0mini特价稳定903z", "720p", "", "audios", 10, 15, true},
		{"SD2.5特价301010线路一", "1080p", "videos", "audios", 4, 30, false},
		{"wan3.0-video", "1080p", "", "audios", 5, 30, false},
		{"wan3.0-video特价1080", "1080p", "", "reference_audio_urls", 5, 30, true},
		{"Minimax-h3-933特价", "768p", "videos", "audios", 5, 30, true},
	}
	for _, tc := range cases {
		t.Run(tc.model, func(t *testing.T) {
			r := GenerationRequest{Model: tc.model, Prompt: "镜头", Duration: tc.min, Resolution: tc.resolution, AspectRatio: "16:9", GenerateAudio: true, Quality: "high", Images: []MediaReference{{URL: "https://cdn.example/b.png", Order: 2}, {URL: "https://cdn.example/a.png", Order: 1}}, Audios: []MediaReference{{URL: "https://cdn.example/a.mp3"}}}
			if tc.videoKey != "" {
				r.Videos = []MediaReference{{URL: "https://cdn.example/a.mp4"}}
			}
			for i := range r.Audios {
				r.Audios[i].Metadata = map[string]any{"durationMs": 5000}
			}
			for i := range r.Videos {
				r.Videos[i].Metadata = map[string]any{"durationMs": 5000}
			}
			spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
			if err != nil {
				t.Fatal(err)
			}
			b := manifestTestBody(t, spec)
			if spec.Path != "/v1/videos" || spec.ContentType != "application/json" || spec.Auth.Type != "bearer" || b["seconds"] != float64(tc.min) || b["aspect_ratio"] != "16:9" {
				t.Fatalf("invalid request: %#v %#v", spec, b)
			}
			_, hasResolution := b["resolution"]
			if hasResolution == tc.omitResolution {
				t.Fatalf("wrong resolution shape: %#v", b)
			}
			imageKey := "images"
			if tc.model == "wan3.0-video特价1080" {
				imageKey = "reference_image_urls"
			}
			if !reflect.DeepEqual(b[imageKey], []any{"https://cdn.example/a.png", "https://cdn.example/b.png"}) || b[tc.audioKey] == nil {
				t.Fatalf("invalid reference fields: %#v", b)
			}
			if tc.videoKey != "" && b[tc.videoKey] == nil {
				t.Fatalf("missing video refs: %#v", b)
			}
			for _, key := range []string{"quality", "fps", "n", "audio", "negative_prompt", "image_urls"} {
				if _, found := b[key]; found {
					t.Fatalf("unexpected field %s", key)
				}
			}
			for _, duration := range []int{tc.min - 1, tc.max + 1} {
				r.Duration = duration
				if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
					t.Fatalf("accepted out-of-range duration %d", duration)
				}
			}
			r.Duration = tc.max
			if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err != nil {
				t.Fatal(err)
			}
			r.Resolution = "4k"
			if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
				t.Fatal("unsupported resolution accepted")
			}
		})
	}
}

func TestJijiuImagesSwitchToMultipartAndKeepNativeGemini(t *testing.T) {
	a := officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-image")
	r := GenerationRequest{Model: "gpt-image-2", Prompt: "cat", AspectRatio: "1024x1024", Resolution: "1k", ImageCount: 1, Quality: "high"}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil || spec.Path != "/v1/images/generations" || len(manifestTestBody(t, spec)) != 4 {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
	r.Model = "gpt-image-2-2K/4K"
	r.Images = []MediaReference{{DataURL: "data:image/png;base64,eA=="}, {URL: "https://cdn.example/ref.png"}}
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil || spec.Path != "/v1/images/edits" || spec.ContentType != "multipart/form-data" || len(spec.Files) != 2 || spec.Files[0].Name != "image" {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
	r.Model = "gpt-image-2"
	r.Resolution = "4k"
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("1K model accepted 4K")
	}
	a = officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-gemini-image")
	r = GenerationRequest{Model: "gemini-3-pro-image", Prompt: "cat", Resolution: "4k", AspectRatio: "16:9", Images: []MediaReference{{DataURL: "data:image/png;base64,eA=="}}}
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil || spec.Path != "/v1beta/models/gemini-3-pro-image:generateContent" || spec.Auth.Type != "bearer" {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
	b := manifestTestBody(t, spec)
	if b["generationConfig"].(map[string]any)["imageConfig"].(map[string]any)["imageSize"] != "4K" {
		t.Fatalf("bad Gemini size: %#v", b)
	}
	state, err := a.ParseCreate(context.Background(), []byte(`{"candidates":[{"content":{"parts":[{"text":"done"},{"inlineData":{"mimeType":"image/webp","data":"eA=="}}]}}]}`))
	if err != nil || len(state.Result.Images) != 1 || state.Result.Images[0].DataURL != "data:image/webp;base64,eA==" {
		t.Fatalf("state=%#v err=%v", state, err)
	}
}

func TestJijiuStatusesErrorsAndAuthenticatedDownload(t *testing.T) {
	a := officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-video")
	for status, want := range map[string]Status{"queued": StatusPending, "in_progress": StatusProcessing, "SUCCESS": StatusSucceeded, "completed": StatusSucceeded, "succeeded": StatusSucceeded, "FAILED": StatusFailed, "failure": StatusFailed, "future": StatusPending} {
		payload, _ := json.Marshal(map[string]any{"id": "job", "status": status})
		state, err := a.ParsePoll(context.Background(), PollContext{TaskID: "job"}, payload)
		if err != nil || state.Status != want {
			t.Fatalf("%s: %#v %v", status, state, err)
		}
	}
	for _, body := range []string{`{"code":"plugin_request_invalid","message":"bad params"}`, `{"error":{"code":"model_not_found","message":"not found"}}`} {
		state, err := a.ParseCreate(context.Background(), []byte(body))
		if err != nil || state.Status != StatusFailed || state.Message == "" {
			t.Fatalf("state=%#v err=%v", state, err)
		}
	}
	spec, err := a.(ResultAdapter).BuildResult(context.Background(), PollContext{TaskID: "job"})
	if err != nil || spec.Path != "/v1/videos/job/content" || spec.Auth.Type != "bearer" {
		t.Fatalf("spec=%#v err=%v", spec, err)
	}
}

func TestJijiuRejectsUnknownAndOverlongReferenceDurations(t *testing.T) {
	a := officialPackageAdapter(t, "jijiu.yingce-plugin", "jijiu-video")
	r := GenerationRequest{Model: "稳定seedance-2.5全参D", Prompt: "cat", Duration: 5, Resolution: "720p", AspectRatio: "16:9", Videos: []MediaReference{{URL: "https://cdn.example/a.mp4"}}}
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("reference video without duration accepted")
	}
	r.Videos[0].Metadata = map[string]any{"durationMs": 20000}
	r.Videos = append(r.Videos, r.Videos[0])
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("more than 30s total references accepted")
	}
	r.Videos[1].Metadata = map[string]any{"durationMs": 10000}
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err != nil {
		t.Fatal(err)
	}
	r.Model = "官转seedance-2.5全参"
	if _, err := a.BuildCreate(context.Background(), RequestContext{Request: r}); err == nil {
		t.Fatal("video references accepted without source-duration billing")
	}
}

func TestJijiuSourceMatchesDistribution(t *testing.T) {
	root := filepath.Join("..", "..", "..", "plugin-packages")
	data, err := os.ReadFile(filepath.Join(root, "jijiu.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"manifest.json", "README.md", "docs/interface.md"} {
		source, err := os.ReadFile(filepath.Join(root, "jijiu", name))
		if err != nil || !reflect.DeepEqual(source, pkg.Files[name]) {
			t.Fatalf("package differs: %s %v", name, err)
		}
	}
}
