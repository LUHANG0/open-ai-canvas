package protocol

import (
	"encoding/json"
	"testing"
)

func TestMengCengDeclaredStreamingFormatSurvivesCustomPaths(t *testing.T) {
	for _, tc := range []struct {
		name, createPath, agentPath, format, wantText, wantAgent string
	}{
		{"custom chat", "/custom/create", "/custom/agent", TextWireChatCompletion, TextWireChatCompletion, TextWireChatCompletion},
		{"custom responses", "/custom/create", "/custom/agent", TextWireResponses, TextWireResponses, TextWireResponses},
		{"custom claude", "/custom/create", "/custom/agent", TextWireClaude, TextWireClaude, TextWireClaude},
		{"known paths win", "/v1/chat/completions", "/v1/responses", TextWireClaude, TextWireChatCompletion, TextWireResponses},
		{"undeclared wire stays unknown", "/custom/create", "/custom/agent", "", "", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			provider := map[string]any{
				"id": "legacy-custom-text", "label": "Custom text", "capabilities": []string{"text"}, "scopes": []string{"creation", "agent"},
				"streamingFormat": tc.format,
				"create":          map[string]any{"method": "POST", "path": tc.createPath},
				"agent":           map[string]any{"method": "POST", "path": tc.agentPath},
				"agentResponse":   map[string]any{"textPaths": []string{"choices.0.message.content"}, "toolCallsPath": "choices.0.message.tool_calls", "toolCallIdPaths": []string{"id"}, "toolCallNamePaths": []string{"function.name"}, "toolCallArgumentsPaths": []string{"function.arguments"}},
				"response":        map[string]any{},
			}
			raw, err := json.Marshal(map[string]any{
				"apiVersion": "yingce.plugin/v2", "id": "legacy-custom-text", "version": "1.0.0", "name": "Custom text", "author": "Test", "documentation": "# Custom text",
				"contributes": map[string]any{"providers": []any{provider}},
			})
			if err != nil {
				t.Fatal(err)
			}
			adapter, err := LoadManifest(raw)
			if err != nil {
				t.Fatal(err)
			}
			metadata := adapter.Metadata()
			if metadata.TextWire != tc.wantText || metadata.AgentWire != tc.wantAgent || metadata.StreamingFormat != tc.format {
				t.Fatalf("wire metadata: text=%q agent=%q legacy=%q; want text=%q agent=%q legacy=%q", metadata.TextWire, metadata.AgentWire, metadata.StreamingFormat, tc.wantText, tc.wantAgent, tc.format)
			}
		})
	}
}
