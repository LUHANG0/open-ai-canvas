package protocol

import (
	"context"
	"encoding/json"
	"testing"
)

func TestFoxRouterChatAndAgent(t *testing.T) {
	a := officialPackageAdapter(t, "foxrouter.yingce-plugin", "foxrouter-chat")
	if a.Metadata().StreamingFormat != "chat-completion" || !a.(AgentCapability).AgentAvailable() {
		t.Fatal("chat must support streaming and Agent")
	}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "gpt-6.1-sol", Instructions: "rules", Prompt: "hello",
		Messages: []Message{{Role: "user", Content: "history"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/v1/chat/completions" || b["max_tokens"] != float64(8192) || len(b["messages"].([]any)) != 3 {
		t.Fatalf("chat request: %#v", b)
	}
	var agent map[string]any
	if err := json.Unmarshal([]byte(`{"chatCompletion":{"model":"wrong","messages":[{"role":"user","content":"hi"},{"role":"assistant","content":null,"tool_calls":[{"id":"call-1","type":"function","function":{"name":"search","arguments":"{}"}}]},{"role":"tool","tool_call_id":"call-1","content":"found"}],"tools":[{"type":"function","function":{"name":"search","parameters":{"type":"object"}}}],"tool_choice":"auto","max_tokens":1024}}`), &agent); err != nil {
		t.Fatal(err)
	}
	ag := a.(AgentAdapter)
	spec, err = ag.BuildAgent(context.Background(), AgentRequestContext{Model: "gpt-6.1-sol", Request: agent})
	if err != nil {
		t.Fatal(err)
	}
	b = manifestTestBody(t, spec)
	if b["model"] != "gpt-6.1-sol" || len(b["messages"].([]any)) != 3 || len(b["tools"].([]any)) != 1 || b["max_tokens"] != float64(1024) {
		t.Fatalf("Agent lost history, tools or selected model: %#v", b)
	}
	result, err := ag.ParseAgent(context.Background(), []byte(`{"choices":[{"message":{"tool_calls":[{"id":"call-1","function":{"name":"search","arguments":"{\"q\":\"fox\"}"}}]}}]}`))
	if err != nil || len(result.ToolCalls) != 1 || result.ToolCalls[0].ID != "call-1" || result.ToolCalls[0].Arguments != `{"q":"fox"}` {
		t.Fatalf("Agent result: %#v %v", result, err)
	}
	if _, err := ag.BuildAgent(context.Background(), AgentRequestContext{Model: "gpt-image-2.5-flare", Request: agent}); err == nil {
		t.Fatal("image model admitted as Agent text model")
	}
}

func TestFoxRouterGPTReferenceFilesAndGuards(t *testing.T) {
	a := officialPackageAdapter(t, "foxrouter.yingce-plugin", "foxrouter-gpt-image")
	r := GenerationRequest{Model: "gpt-image-2.5-sunburst", Prompt: "poster", AspectRatio: "1536x1024", Quality: "high", ImageCount: 1}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil || spec.Path != "/v1/images/generations" || spec.ContentType != "application/json" {
		t.Fatalf("generation: %#v %v", spec, err)
	}
	r.Images = []MediaReference{{URL: "https://cdn.example/b.png", Order: 2}, {URL: "https://cdn.example/a.png", Order: 1}}
	spec, err = a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	if spec.Path != "/v1/images/edits" || spec.ContentType != "multipart/form-data" || len(spec.Files) != 2 || spec.Files[0].Name != "image" || spec.Files[0].Reference.URL != "https://cdn.example/a.png" || b["quality"] != "high" || b["size"] != "1536x1024" {
		t.Fatalf("reference request: %#v", spec)
	}
	for _, field := range []string{"images", "image_urls", "resolution", "image_size"} {
		if _, exists := b[field]; exists {
			t.Fatalf("undocumented GPT field %s", field)
		}
	}
	for _, edit := range []func(*GenerationRequest){
		func(r *GenerationRequest) { r.Images = append(r.Images, r.Images[0], r.Images[0], r.Images[0]) },
		func(r *GenerationRequest) { r.Images[0].Role = "mask" },
		func(r *GenerationRequest) { r.ImageCount = 2 },
		func(r *GenerationRequest) { r.Resolution = "4k" },
		func(r *GenerationRequest) { r.Quality = "max" },
		func(r *GenerationRequest) { r.Model = "gemini-3-pro-image" },
	} {
		bad := r
		bad.Images = append([]MediaReference(nil), r.Images...)
		edit(&bad)
		if _, err := a.BuildCreate(context.Background(), RequestContext{Request: bad}); err == nil {
			t.Fatalf("invalid GPT request accepted: %#v", bad)
		}
	}
	result, err := a.ParseCreate(context.Background(), []byte(`{"data":[{"url":"https://cdn.example/result.png"},{"b64_json":"YWJj"}]}`))
	if err != nil || result.Status != StatusSucceeded || result.Result == nil || len(result.Result.Images) != 2 {
		t.Fatalf("image response: %#v %v", result, err)
	}
	failed, err := a.ParseCreate(context.Background(), []byte(`{"error":{"code":"model_unavailable","message":"paused"}}`))
	if err != nil || failed.Status != StatusFailed {
		t.Fatalf("upstream rejection treated as success: %#v %v", failed, err)
	}
}

func TestFoxRouterGeminiReferenceJSONAndResolution(t *testing.T) {
	a := officialPackageAdapter(t, "foxrouter.yingce-plugin", "foxrouter-gemini-image")
	r := GenerationRequest{Model: "gemini-nano-banana-2.1", Prompt: "poster", AspectRatio: "16:9", Resolution: "4k", Images: []MediaReference{{URL: "https://cdn.example/b.png", Order: 2}, {URL: "https://cdn.example/a.png", Order: 1}}}
	spec, err := a.BuildCreate(context.Background(), RequestContext{Request: r})
	if err != nil {
		t.Fatal(err)
	}
	b := manifestTestBody(t, spec)
	urls := b["image_urls"].([]any)
	if spec.Path != "/v1/images/generations" || spec.ContentType != "application/json" || b["image_size"] != "4K" || b["aspect_ratio"] != "16:9" || len(urls) != 2 || urls[0] != "https://cdn.example/a.png" || len(spec.Files) != 0 {
		t.Fatalf("Gemini request: %#v", spec)
	}
	for _, field := range []string{"images", "size", "quality", "generationConfig", "contents"} {
		if _, exists := b[field]; exists {
			t.Fatalf("wrong upstream contract %s", field)
		}
	}
	for _, edit := range []func(*GenerationRequest){
		func(r *GenerationRequest) {
			r.Images = append(r.Images, r.Images[0], r.Images[0], r.Images[0], r.Images[0], r.Images[0])
		},
		func(r *GenerationRequest) { r.Images[0].URL = "http://cdn.example/ref.png" },
		func(r *GenerationRequest) { r.Images[0].Role = "mask" },
		func(r *GenerationRequest) { r.Resolution = "8k" },
		func(r *GenerationRequest) { r.Videos = []MediaReference{{URL: "https://cdn.example/ref.mp4"}} },
		func(r *GenerationRequest) { r.Model = "gemini-omni-flash" },
	} {
		bad := r
		bad.Images = append([]MediaReference(nil), r.Images...)
		edit(&bad)
		if _, err := a.BuildCreate(context.Background(), RequestContext{Request: bad}); err == nil {
			t.Fatalf("invalid Gemini request accepted: %#v", bad)
		}
	}
}
