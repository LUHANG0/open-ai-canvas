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
)

func TestDramaChatStreamsTextAndAgentToolArguments(t *testing.T) {
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
			input := canvasGenerationInput{Mode: "text", Prompt: "hello", StreamText: true, Config: providerConfig{BaseURL: server.URL, APIKey: "test-key", Model: "chat-model", InterfaceType: "drama-chat"}, OnTextDelta: func(delta string) { deltas.WriteString(delta) }}
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
