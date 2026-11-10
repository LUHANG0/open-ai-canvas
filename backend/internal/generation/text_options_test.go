package generation

import (
	"encoding/json"
	"testing"
)

func TestTextOptionsLegacyThinkingCompatibility(t *testing.T) {
	for _, tc := range []struct{ name, input, want string }{
		{"old enabled", `{"thinking":true}`, "medium"},
		{"old disabled", `{"thinking":false}`, "off"},
		{"new default", `{}`, ""},
		{"new wins", `{"thinking":true,"thinkingLevel":"low"}`, "low"},
		{"explicit default wins", `{"thinking":true,"thinkingLevel":""}`, ""},
		{"new off wins", `{"thinking":true,"thinkingLevel":"off"}`, "off"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var input Input
			if err := json.Unmarshal([]byte(`{"mode":"text","textOptions":`+tc.input+`}`), &input); err != nil {
				t.Fatal(err)
			}
			if input.TextOptions.ThinkingLevel != tc.want {
				t.Fatalf("got %q, want %q", input.TextOptions.ThinkingLevel, tc.want)
			}
			encoded, err := json.Marshal(input)
			if err != nil {
				t.Fatal(err)
			}
			var restored Input
			if err := json.Unmarshal(encoded, &restored); err != nil {
				t.Fatal(err)
			}
			if restored.TextOptions.ThinkingLevel != tc.want {
				t.Fatalf("round trip lost intent: %s", encoded)
			}
		})
	}
}
