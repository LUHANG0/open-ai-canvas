package app

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestFourSTokenRuntimeSubmitsOncePollsAndDownloadsURL(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, kind := range []string{"image", "video"} {
		t.Run(kind, func(t *testing.T) {
			registry := loadOfficialFallbackRegistry()
			a, ok := registry.Resolve("4stoken-" + kind)
			if !ok {
				t.Fatal("plugin unavailable")
			}
			creates, polls, downloads := 0, 0, 0
			path := "/v1/videos"
			pollPath := path + "/local-task"
			if kind == "image" {
				path = "/v1/images/generations"
				pollPath = "/v1/images/tasks/local-task"
			}
			var server *httptest.Server
			server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/content") {
					t.Error("unexpected content endpoint")
					http.NotFound(w, r)
					return
				}
				switch r.Method + " " + r.URL.Path {
				case "POST " + path:
					creates++
					if r.Header.Get("Authorization") != "Bearer test-key" {
						t.Error("missing authorization")
					}
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
					}
					if kind == "image" && (body["async"] != true || body["quality"] != nil) {
						t.Errorf("image body=%#v", body)
					}
					if kind == "video" && (body["duration"] != float64(6) || body["aspect_ratio"] != "16:9") {
						t.Errorf("video body=%#v", body)
					}
					fmt.Fprint(w, `{"task_id":"local-task","status":"pending"}`)
				case "GET " + pollPath:
					polls++
					if r.Header.Get("Authorization") != "Bearer test-key" {
						t.Error("missing poll authorization")
					}
					switch polls {
					case 1:
						w.WriteHeader(503)
						fmt.Fprint(w, `{"error":{"message":"temporary"}}`)
					case 2:
						fmt.Fprint(w, `{"task_id":"local-task","status":"running"}`)
					default:
						key := "url"
						if kind == "video" {
							key = "video_url"
						}
						fmt.Fprintf(w, `{"task_id":"local-task","status":"succeeded","data":[{"%s":"%s/media"}]}`, key, server.URL)
					}
				case "GET /media":
					downloads++
					if kind == "image" {
						w.Header().Set("Content-Type", "image/png")
						w.Write(mediaTestPNG(t))
					} else {
						w.Header().Set("Content-Type", "video/mp4")
						fmt.Fprint(w, "video-test")
					}
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			policy := protocolAdapterPollPolicy(kind, a)
			policy.Sleep = func(context.Context, time.Duration) error { return nil }
			input := canvasGenerationInput{Mode: kind, Prompt: "a cat", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: "4stoken-" + kind, Size: "16:9", VideoSeconds: "6", VQuality: "720p"}}
			result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, a, policy)
			if err != nil || result["mode"] != kind || creates != 1 || polls != 3 || downloads != 1 {
				t.Fatalf("result=%#v err=%v calls=%d/%d/%d", result, err, creates, polls, downloads)
			}
			// Resuming an accepted task bypasses create even without the original prompt.
			ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, providerAnalyticsContext{ProviderRequestID: "local-task"})
			input.Prompt = ""
			if _, err := runProtocolAdapterTaskWithPolicy(ctx, input, a, policy); err != nil {
				t.Fatal(err)
			}
			if creates != 1 || polls != 4 || downloads != 2 {
				t.Fatalf("recovery calls=%d/%d/%d", creates, polls, downloads)
			}
		})
	}
}

func TestFourSTokenRuntimeUploadsRepeatedImageFilesAndMask(t *testing.T) {
	allowLoopbackProviderTest(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.URL.Path != "/v1/images/edits" || !strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/form-data;") {
			t.Errorf("path=%s type=%s", r.URL.Path, r.Header.Get("Content-Type"))
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Error(err)
			w.WriteHeader(400)
			return
		}
		defer r.MultipartForm.RemoveAll()
		if len(r.MultipartForm.File["image"]) != 2 || len(r.MultipartForm.File["mask"]) != 1 || r.FormValue("async") != "true" || r.FormValue("quality") != "" || r.FormValue("n") != "1" {
			t.Errorf("multipart fields=%#v files=%#v", r.MultipartForm.Value, r.MultipartForm.File)
		}
		for _, key := range []string{"image", "mask"} {
			for _, header := range r.MultipartForm.File[key] {
				if header.Size == 0 {
					t.Error("empty upload")
				}
			}
		}
		// Exercise direct synchronous compatibility without a second create request.
		fmt.Fprint(w, `{"task_id":"image-task","data":[{"b64_json":"`+strings.TrimPrefix(dataURL("image/png", mediaTestPNG(t)), "data:image/png;base64,")+`"}]}`)
	}))
	defer server.Close()
	a, _ := loadOfficialFallbackRegistry().Resolve("4stoken-image")
	data := dataURL("image/png", mediaTestPNG(t))
	input := canvasGenerationInput{Mode: "image", Prompt: "edit", ReferenceImages: []providerMedia{{DataURL: data, MimeType: "image/png"}, {DataURL: data, MimeType: "image/png"}}, Mask: &providerMedia{DataURL: data, MimeType: "image/png"}, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: "4stoken-image", Size: "1024x1024", Count: "1"}}
	result, err := runProtocolAdapterTask(context.Background(), input, a)
	if err != nil || result["mode"] != "image" || calls.Load() != 1 {
		t.Fatalf("result=%#v err=%v calls=%d", result, err, calls.Load())
	}
}

func TestFourSTokenFailedCreateIsNotReplayedAndAcceptedTasksAreResumable(t *testing.T) {
	allowLoopbackProviderTest(t)
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(402)
		fmt.Fprint(w, `{"error":{"code":"quota_exceeded","message":"quota exhausted"}}`)
	}))
	defer server.Close()
	a, _ := loadOfficialFallbackRegistry().Resolve("4stoken-video")
	input := canvasGenerationInput{Mode: "video", Prompt: "move", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: "4stoken-video", VideoSeconds: "6"}}
	if _, err := runProtocolAdapterTask(context.Background(), input, a); err == nil || calls.Load() != 1 {
		t.Fatalf("err=%v calls=%d", err, calls.Load())
	}
	for _, kind := range []string{"image", "video"} {
		input.Mode = kind
		input.Config.InterfaceType = "4stoken-" + kind
		input.Config.BaseURL = "https://93.184.216.34"
		encoded, _ := json.Marshal(input)
		task := model.Task{Type: "canvas_" + kind, ProviderRequestID: "local-task"}
		if !(&Service{}).shouldDeferProviderTask(task, string(encoded), context.DeadlineExceeded) {
			t.Fatalf("%s is not resumable", kind)
		}
		task.ProviderRequestID = ""
		if (&Service{}).shouldDeferProviderTask(task, string(encoded), context.DeadlineExceeded) {
			t.Fatal("missing task ID must fail closed")
		}
	}
}

func TestFourSTokenAgentPreservesCanonicalToolRound(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, test := range []struct{ id, path, response string }{
		{"4stoken-chat", "/v1/chat/completions", `{"choices":[{"message":{"content":"answer","tool_calls":[{"id":"call_new","function":{"name":"generate_image","arguments":"{}"}}]}}]}`},
		{"4stoken-responses", "/v1/responses", `{"output":[{"type":"message","content":[{"type":"output_text","text":"answer"}]},{"type":"function_call","id":"fc_new","call_id":"call_new","name":"generate_image","arguments":"{}"}]}`},
		{"4stoken-claude", "/v1/messages", `{"content":[{"type":"text","text":"answer"},{"type":"tool_use","id":"call_new","name":"generate_image","input":{}}]}`},
	} {
		t.Run(test.id, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path != test.path || r.Header.Get("Authorization") != "Bearer test-key" {
					t.Errorf("path=%s", r.URL.Path)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				encoded, _ := json.Marshal(body)
				for _, marker := range []string{"call_old", "tool result", "generate_image"} {
					if !strings.Contains(string(encoded), marker) {
						t.Errorf("lost %s in %s", marker, encoded)
					}
				}
				fmt.Fprint(w, test.response)
			}))
			defer server.Close()
			input := canvasGenerationInput{Mode: "text", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: test.id}, AgentRequests: &agentToolRequests{Canonical: &canonicalAgentRequest{
				Messages: []map[string]interface{}{{"role": "user", "content": "hello"}, {"type": "function_call", "id": "fc_old", "call_id": "call_old", "name": "inspect", "arguments": "{}"}, {"role": "tool", "tool_call_id": "call_old", "content": "tool result"}, {"role": "user", "content": "continue"}},
				Tools:    []map[string]interface{}{{"type": "function", "function": map[string]any{"name": "generate_image", "parameters": map[string]any{"type": "object"}}}}, ToolChoice: "auto", SystemPrompt: "assistant",
			}}}
			ctx := withProtocolRegistry(context.Background(), loadOfficialFallbackRegistry())
			result, err := runAgentToolTask(ctx, input)
			if err != nil || result["text"] != "answer" {
				t.Fatalf("result=%#v err=%v", result, err)
			}
			encoded, _ := json.Marshal(result)
			if !strings.Contains(string(encoded), "call_new") || !strings.Contains(string(encoded), "generate_image") {
				t.Fatalf("tool lost: %s", encoded)
			}
			if test.id == "4stoken-responses" && !strings.Contains(string(encoded), `"item_id":"fc_new"`) {
				t.Fatalf("Responses item identity lost: %s", encoded)
			}
		})
	}
}

func TestFourSTokenResponsesJSONCollectsNestedTextBlocks(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, id := range []string{"4stoken-responses", "openai-response"} {
		t.Run(id, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"output":[{"type":"message","content":[{"type":"output_text","text":"hello "},{"type":"output_text","text":"world"}]}]}`)
			}))
			defer server.Close()
			ctx := withProtocolRegistry(context.Background(), loadOfficialFallbackRegistry())
			result, err := runTextTask(ctx, canvasGenerationInput{Mode: "text", Prompt: "hello", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: id}})
			if err != nil || result["text"] != "hello world" {
				t.Fatalf("result=%#v err=%v", result, err)
			}
		})
	}
}
