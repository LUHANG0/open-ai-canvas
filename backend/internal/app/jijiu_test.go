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

func TestJijiuAgentDefaultPoliciesFitStandardTier(t *testing.T) {
	for _, mode := range []string{"read_only", "auto", "confirm"} {
		t.Run(mode, func(t *testing.T) {
			req := agentTestRequest()
			req.PermissionMode = mode
			system, _, err := compileCloudAgentPolicies(req, "梦层", nil, "", cloudAgentProfileSnapshot{})
			if err != nil {
				t.Fatal(err)
			}
			canonical := cloudAgentCanonicalFor(system, nil, "检查当前画布", req, false)
			requests, err := expandCanonicalAgentRequest(&canonical, providerConfig{Model: "gpt-6.1-sol", InterfaceType: "jijiu-chat"}, true)
			if err != nil {
				t.Fatal(err)
			}
			encoded, _ := json.Marshal(requests.ChatCompletion)
			t.Logf("default Agent request: %d Unicode characters, %d bytes", len([]rune(string(encoded))), len(encoded))
			adapter, ok := agentProtocolAdapterForContext(withProtocolRegistry(context.Background(), loadOfficialFallbackRegistry()), "jijiu-chat")
			if !ok {
				t.Fatal("Jijiu Agent is not registered")
			}
			if _, err := adapter.BuildAgent(context.Background(), protocol.AgentRequestContext{Model: "gpt-6.1-sol", Request: map[string]any{"chatCompletion": requests.ChatCompletion}}); err != nil {
				t.Fatalf("real default policy/tools cannot start: %v", err)
			}
		})
	}
}

func TestJijiuAgentToolRoundTripAndHostPolicyAdmission(t *testing.T) {
	allowLoopbackProviderTest(t)
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" || body["stream"] != true || body["max_tokens"] != float64(4096) || body["stream_options"].(map[string]any)["include_usage"] != true {
			t.Errorf("bad Agent wire request: %#v", body)
		}
		messages := body["messages"].([]any)
		w.Header().Set("Content-Type", "text/event-stream")
		if requests == 1 {
			if len(messages) != 2 || len(body["tools"].([]any)) != 1 {
				t.Errorf("missing policy/tools: %#v", body)
			}
			fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"q\\\":\"}}]}}]}\n\n")
			fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"hello\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}\n\n")
		} else {
			last := messages[len(messages)-1].(map[string]any)
			if last["role"] != "tool" || last["tool_call_id"] != "call-1" || last["content"] != "found" {
				t.Errorf("tool result lost identity: %#v", messages)
			}
			fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"done\"},\"finish_reason\":\"stop\"}]}\n\n")
		}
		usage := `{"prompt_tokens":100,"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":40}}`
		fmt.Fprintf(w, "data: {\"choices\":[],\"usage\":%s}\n\ndata: [DONE]\n\n", usage)
		log := &model.ApiCallLog{Capability: "text"}
		(&Service{}).EnrichAPICallLog(log, []byte(`{"usage":`+usage+`}`))
		if !log.UsageAvailable || log.InputTokens != 100 || log.OutputTokens != 20 || log.CachedTokens != 40 {
			t.Errorf("usage not retained: %#v", log)
		}
	}))
	defer server.Close()
	canonical := &canonicalAgentRequest{SystemPrompt: "rules", Messages: []map[string]any{{"role": "user", "content": "hello"}}, Tools: []map[string]any{{"type": "function", "function": map[string]any{"name": "lookup", "parameters": map[string]any{"type": "object"}}}}, ToolChoice: "auto"}
	input := canvasGenerationInput{Mode: "text", StreamText: true, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-6.1-sol", InterfaceType: "jijiu-chat"}, AgentRequests: &agentToolRequests{Canonical: canonical}}
	input.TextOptions.MaxOutputTokens = 4096
	ctx := withProtocolRegistry(context.Background(), loadOfficialFallbackRegistry())
	result, err := runAgentToolTask(ctx, input)
	if err != nil {
		t.Fatal(err)
	}
	calls := result["toolCalls"].([]interface{})
	if len(calls) != 1 {
		t.Fatalf("calls=%#v", result)
	}
	call := calls[0].(map[string]interface{})
	function := call["function"].(map[string]interface{})
	if call["id"] != "call-1" || function["name"] != "lookup" || function["arguments"] != `{"q":"hello"}` {
		t.Fatalf("chunked call=%#v", call)
	}
	canonical.Messages = append(canonical.Messages, map[string]any{"role": "assistant", "content": "", "tool_calls": calls}, map[string]any{"role": "tool", "tool_call_id": "call-1", "content": "found"})
	result, err = runAgentToolTask(ctx, input)
	if err != nil || result["text"] != "done" || requests != 2 {
		t.Fatalf("second step=%#v err=%v requests=%d", result, err, requests)
	}
	input.TextOptions.MaxOutputTokens = 32001
	if _, err := runAgentToolTask(ctx, input); err == nil || requests != 2 {
		t.Fatalf("host output policy bypassed guard: err=%v requests=%d", err, requests)
	}
	input.TextOptions.MaxOutputTokens = 4096
	canonical.Messages[len(canonical.Messages)-1]["content"] = strings.Repeat("x", 50001)
	if _, err := runAgentToolTask(ctx, input); err == nil || requests != 2 {
		t.Fatalf("tool context bypassed guard: err=%v requests=%d", err, requests)
	}
}

func TestJijiuTextRuntimeStreamsWithoutReplayingRejectedContext(t *testing.T) {
	allowLoopbackProviderTest(t)
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		if r.URL.Path != "/v1/chat/completions" || r.Header.Get("Authorization") != "Bearer test-key" || body["stream"] != true || body["max_tokens"] != float64(8192) {
			t.Errorf("invalid text request: %#v", body)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"}}]}\n\n")
		w.(http.Flusher).Flush()
		fmt.Fprint(w, "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":100,\"completion_tokens\":20,\"prompt_tokens_details\":{\"cached_tokens\":40}}}\n\n")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()
	var deltas strings.Builder
	input := canvasGenerationInput{Mode: "text", Prompt: "hello", StreamText: true, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "gpt-6.1-sol", InterfaceType: "jijiu-chat"}, OnTextDelta: func(s string) { deltas.WriteString(s) }}
	ctx := withProtocolRegistry(context.Background(), loadOfficialFallbackRegistry())
	result, err := runTextTask(ctx, input)
	if err != nil || result["text"] != "hello" || deltas.String() != "hello" || requests != 1 {
		t.Fatalf("result=%#v err=%v deltas=%q requests=%d", result, err, deltas.String(), requests)
	}
	input.Prompt = strings.Repeat("界", 50001)
	if _, err := runTextTask(ctx, input); err == nil || requests != 1 {
		t.Fatalf("long request reached provider: err=%v requests=%d", err, requests)
	}
}

func TestJijiuVideoRuntimeKeepsTaskAcrossPollAndDownloads(t *testing.T) {
	allowLoopbackProviderTest(t)
	a, ok := loadOfficialFallbackRegistry().Resolve("jijiu-video")
	if !ok {
		t.Fatal("jijiu-video not registered")
	}
	creates, polls, downloads := 0, 0, 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-key" {
			t.Error("missing bearer")
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.Method + " " + r.URL.Path {
		case "POST /v1/videos":
			creates++
			var body map[string]any
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body["seconds"] != float64(5) || body["resolution"] != nil {
				t.Errorf("body=%#v err=%v", body, err)
			}
			fmt.Fprint(w, `{"id":"jijiu-job","status":"queued"}`)
		case "GET /v1/videos/jijiu-job":
			polls++
			if polls == 1 {
				w.WriteHeader(http.StatusServiceUnavailable)
				fmt.Fprint(w, `{"error":{"message":"temporary"}}`)
			} else if polls == 2 {
				fmt.Fprint(w, `{"id":"jijiu-job","status":"UNKNOWN_NEW_STATE"}`)
			} else {
				fmt.Fprint(w, `{"id":"jijiu-job","status":"SUCCESS","url":"https://unused.invalid/video"}`)
			}
		case "GET /v1/videos/jijiu-job/content":
			downloads++
			w.Header().Set("Content-Type", "video/mp4")
			fmt.Fprint(w, "fixture-video-bytes")
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()
	policy := protocolAdapterPollPolicy("video", a)
	if policy.Interval != 8*time.Second {
		t.Fatalf("poll interval=%v", policy.Interval)
	}
	policy.Sleep = func(context.Context, time.Duration) error { return nil }
	input := canvasGenerationInput{Mode: "video", Prompt: "cat", Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "满血seedance-2.5全参C", InterfaceType: "jijiu-video", Size: "16:9", VQuality: "1080p", VideoSeconds: "5"}}
	result, err := runProtocolAdapterTaskWithPolicy(context.Background(), input, a, policy)
	if err != nil || result["mode"] != "video" || creates != 1 || polls != 3 || downloads != 1 {
		t.Fatalf("result=%#v err=%v calls=%d/%d/%d", result, err, creates, polls, downloads)
	}
	resultSpec, err := a.(protocol.ResultAdapter).BuildResult(context.Background(), protocol.PollContext{TaskID: "jijiu-job"})
	if err != nil || resultSpec.Auth.Type != "bearer" {
		t.Fatalf("result spec=%#v err=%v", resultSpec, err)
	}
}
