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
	"yingce/backend/internal/protocol"
)

func yezonghuiTestAdapter(t *testing.T, id string) protocol.Adapter {
	t.Helper()
	registry := loadOfficialFallbackRegistry()
	a, ok := registry.Resolve(id)
	if !ok {
		t.Fatalf("provider %s not loaded", id)
	}
	return a
}

func TestYezonghuiRuntimeCreateRetryPollAndAuthenticatedDownload(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, kind := range []string{"image", "video"} {
		t.Run(kind, func(t *testing.T) {
			a := yezonghuiTestAdapter(t, "yezonghui-"+kind)
			declared := protocolAdapterPollPolicy(kind, a)
			wantInterval := 15 * time.Second
			if kind == "video" {
				wantInterval = time.Minute
			}
			if declared.Interval != wantInterval || declared.InitialDelay != wantInterval || declared.RetryTransient || declared.TransientRetryLimit != 3 {
				t.Fatalf("policy = %#v", declared)
			}
			creates, polls, downloads := 0, 0, 0
			path := "/v1/" + kind + "s"
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer test-key" {
					t.Error("missing bearer authorization")
					w.WriteHeader(http.StatusUnauthorized)
					return
				}
				w.Header().Set("Content-Type", "application/json")
				switch r.Method + " " + r.URL.Path {
				case "POST " + path:
					creates++
					var body map[string]any
					if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
						t.Error(err)
					}
					if body["resolution"] != "1080p" {
						t.Errorf("body = %#v", body)
					}
					if kind == "image" && (body["ratio"] != "16:9" || len(body) != 4) {
						t.Errorf("image body = %#v", body)
					}
					if kind == "video" && (body["seconds"] != "10" || body["size"] != "16:9" || body["audio"] != false) {
						t.Errorf("video body = %#v", body)
					}
					fmt.Fprint(w, `{"id":"task_1","status":"queued"}`)
				case "GET " + path + "/task_1":
					polls++
					switch polls {
					case 1:
						w.WriteHeader(http.StatusServiceUnavailable)
						fmt.Fprint(w, `{"error":{"message":"temporary failure"}}`)
					case 2:
						fmt.Fprint(w, `{"id":"task_1","status":"future_state"}`)
					default:
						// A public URL must not bypass the authenticated content contract.
						fmt.Fprint(w, `{"id":"task_1","status":"completed","url":"https://invalid.example/result"}`)
					}
				case "GET " + path + "/task_1/content":
					downloads++
					if kind == "image" {
						w.Header().Set("Content-Type", "image/png")
						w.Write(mediaTestPNG(t))
					} else {
						w.Header().Set("Content-Type", "video/mp4")
						fmt.Fprint(w, "video-test-bytes")
					}
				default:
					http.NotFound(w, r)
				}
			}))
			defer server.Close()
			declared.Sleep = func(context.Context, time.Duration) error { return nil }
			input := canvasGenerationInput{Mode: kind, Prompt: "a cat", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: "yezonghui-" + kind, Size: "16:9", ImageResolution: "1080p", VQuality: "1080p", VideoSeconds: "10"}}
			result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, a, declared)
			if err != nil || result["mode"] != kind || creates != 1 || polls != 3 || downloads != 1 {
				t.Fatalf("result=%#v err=%v create/poll/download=%d/%d/%d", result, err, creates, polls, downloads)
			}
		})
	}
}

func TestYezonghuiDoesNotReplayFailedCreation(t *testing.T) {
	allowLoopbackProviderTest(t)
	var creates atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		creates.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `{"code":"busy","message":"temporary failure"}`)
	}))
	defer server.Close()
	a := yezonghuiTestAdapter(t, "yezonghui-image")
	_, err := runProtocolAdapterTask(context.Background(), canvasGenerationInput{Mode: "image", Prompt: "cat", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: "yezonghui-image", ImageResolution: "1080p", Size: "1:1"}}, a)
	if err == nil || creates.Load() != 1 {
		t.Fatalf("err=%v requests=%d", err, creates.Load())
	}
}

func TestYezonghuiChatStreamsTextAndAgentToolArguments(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, agent := range []bool{false, true} {
		t.Run(fmt.Sprintf("agent=%v", agent), func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests.Add(1)
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if r.URL.Path != "/v1/chat/completions" || body["stream"] != true || r.Header.Get("Authorization") != "Bearer test-key" {
					t.Errorf("request path=%s body=%#v", r.URL.Path, body)
				}
				if agent && len(body["tools"].([]any)) != 1 {
					t.Errorf("tools lost: %#v", body)
				}
				w.Header().Set("Content-Type", "text/event-stream")
				fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n")
				w.(http.Flusher).Flush()
				if agent {
					fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"generate_image\",\"arguments\":\"{\\\"prompt\\\":\"}}]}}]}\n\n")
					fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"cat\\\"}\"}}]}}]}\n\n")
				}
				fmt.Fprint(w, "data: [DONE]\n\n")
			}))
			defer server.Close()
			var deltas strings.Builder
			input := canvasGenerationInput{Mode: "text", Prompt: "hello", StreamText: true, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "chat-model", InterfaceType: "yezonghui-chat"}, OnTextDelta: func(delta string) { deltas.WriteString(delta) }}
			ctx := withProtocolRegistry(context.Background(), loadOfficialFallbackRegistry())
			var result map[string]interface{}
			var err error
			if agent {
				input.AgentRequests = &agentToolRequests{ChatCompletion: map[string]interface{}{"messages": []any{map[string]any{"role": "user", "content": "hello"}}, "tools": []any{map[string]any{"type": "function", "function": map[string]any{"name": "generate_image", "parameters": map[string]any{"type": "object"}}}}, "tool_choice": "auto"}}
				result, err = runAgentToolTask(ctx, input)
			} else {
				result, err = runTextTask(ctx, input)
			}
			if err != nil || result["text"] != "hello" || deltas.String() != "hello" || requests.Load() != 1 {
				t.Fatalf("result=%#v err=%v deltas=%q requests=%d", result, err, deltas.String(), requests.Load())
			}
			if agent {
				encoded, _ := json.Marshal(result)
				if !strings.Contains(string(encoded), "generate_image") || !strings.Contains(string(encoded), "call_1") {
					t.Fatalf("tool call lost: %s", encoded)
				}
			}
		})
	}
}

func TestYezonghuiDefaultsRequireModelSpecificConfiguration(t *testing.T) {
	image := DefaultImageCapabilityConfig("yezonghui-image", "unknown-model")
	if image.References.MaskSupported || image.MaxOutputs != 1 || image.Quality.Supported || image.ResponseFormat.Supported || image.OutputFormat.Supported || image.TransparentBackground.Supported || len(image.Resolution.Values) != 0 || image.Size.Parameter != "aspect_ratio" {
		t.Fatalf("image = %#v", image)
	}
	video := DefaultModelCapabilityConfig("yezonghui-video").Video
	if len(video.Resolutions) != 0 || video.DefaultResolution != "" || !video.GenerateAudio.Supported || video.GenerateAudio.Default || video.Watermark.Supported {
		t.Fatalf("video = %#v", video)
	}
}

func TestYezonghuiRecoveryPollsExistingIDWithoutCreating(t *testing.T) {
	allowLoopbackProviderTest(t)
	for _, kind := range []string{"image", "video"} {
		t.Run(kind, func(t *testing.T) {
			requests := []string{}
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests = append(requests, r.Method+" "+r.URL.Path)
				if r.Method != "GET" {
					t.Error("recovery attempted creation")
					w.WriteHeader(409)
					return
				}
				if strings.HasSuffix(r.URL.Path, "/content") {
					if kind == "image" {
						w.Header().Set("Content-Type", "image/png")
						w.Write(mediaTestPNG(t))
					} else {
						w.Header().Set("Content-Type", "video/mp4")
						fmt.Fprint(w, "video")
					}
					return
				}
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, `{"id":"existing-task","status":"completed"}`)
			}))
			defer server.Close()
			a := yezonghuiTestAdapter(t, "yezonghui-"+kind)
			ctx := context.WithValue(context.Background(), providerAnalyticsKey{}, providerAnalyticsContext{ProviderRequestID: "existing-task"})
			input := canvasGenerationInput{Mode: kind, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "model", InterfaceType: "yezonghui-" + kind}}
			result, err := runProtocolAdapterTaskWithPolicy(ctx, input, a, fastVideoPollPolicy())
			if err != nil || result["mode"] != kind || len(requests) != 2 {
				t.Fatalf("result=%#v err=%v requests=%v", result, err, requests)
			}
			input.Config.BaseURL = "https://93.184.216.34"
			encoded, _ := json.Marshal(input)
			task := model.Task{Type: "canvas_" + kind, ProviderRequestID: "existing-task"}
			if !(&Service{}).shouldDeferProviderTask(task, string(encoded), context.DeadlineExceeded) {
				t.Fatal("accepted asynchronous task is not resumable")
			}
			task.ProviderRequestID = ""
			if (&Service{}).shouldDeferProviderTask(task, string(encoded), context.DeadlineExceeded) {
				t.Fatal("task without upstream ID must not be resumed")
			}
		})
	}
}
