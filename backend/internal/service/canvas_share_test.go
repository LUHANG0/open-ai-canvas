package service

import (
	"encoding/json"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestCanvasShareTokenHashDoesNotExposeToken(t *testing.T) {
	token := "example-share-token"
	first := canvasShareTokenHash(token)
	if first == token || first != canvasShareTokenHash(token) || len(first) != 64 {
		t.Fatalf("unexpected token hash: %q", first)
	}
}

func TestPublicCanvasProjectScrubsSecretsAndRewritesResources(t *testing.T) {
	payload := map[string]any{
		"id": "project-1", "title": "公开画布", "chatSessions": []any{map[string]any{"secret": "chat"}},
		"nodes": []any{map[string]any{
			"id": "node-1", "type": "image", "title": "镜头", "position": map[string]any{"x": 1, "y": 2}, "width": 320, "height": 240,
			"metadata": map[string]any{
				"content": "data:image/png;base64,secret", "storageKey": "resource:resource_123", "prompt": "保留提示词",
				"apiKey": "secret", "taskId": "task-1", "skillSnapshot": map[string]any{"apiKey": "nested-secret", "name": "技能"},
			},
		}},
		"connections": []any{},
	}
	raw, _ := json.Marshal(payload)
	project := &model.CanvasProject{ID: "project-1", Title: "公开画布", PayloadJSON: string(raw)}
	public, resources, err := publicCanvasProject(project, "share-token")
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(public)
	text := string(encoded)
	for _, forbidden := range []string{"data:image", "secret", "task-1", `"secret":"chat"`} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("public payload leaked %q: %s", forbidden, text)
		}
	}
	if !strings.Contains(text, "保留提示词") || !strings.Contains(text, "/api/public/canvas-shares/share-token/resources/resource_123/file") {
		t.Fatalf("public payload lost expected data: %s", text)
	}
	if !resources["resource_123"] {
		t.Fatal("referenced resource was not authorized")
	}
}

func TestPublicCanvasProjectPreservesMediaLayout(t *testing.T) {
	for _, nodeType := range []string{"image", "video"} {
		for _, layout := range []struct {
			name       string
			manualSize bool
			locked     bool
		}{
			{name: "manual", manualSize: true},
			{name: "locked", locked: true},
			{name: "manual_and_locked", manualSize: true, locked: true},
			{name: "automatic"},
		} {
			t.Run(nodeType+"/"+layout.name, func(t *testing.T) {
				const width, height, x, y = 840.0, 482.222222, -250.666667, 983.333333
				payload := map[string]any{
					"id": "project-1",
					"nodes": []any{map[string]any{
						"id": "node-1", "type": nodeType, "title": "手工布局",
						"width": width, "height": height, "position": map[string]any{"x": x, "y": y},
						"metadata": map[string]any{
							"manualSize": layout.manualSize, "locked": layout.locked,
							"storageKey": "resource:resource_123", "apiKey": "secret", "taskId": "task-1", "unlistedField": "private",
						},
					}},
				}
				raw, err := json.Marshal(payload)
				if err != nil {
					t.Fatal(err)
				}
				public, _, err := publicCanvasProject(&model.CanvasProject{ID: "project-1", PayloadJSON: string(raw)}, "share-token")
				if err != nil {
					t.Fatal(err)
				}
				nodes, ok := public["nodes"].([]any)
				if !ok || len(nodes) != 1 {
					t.Fatalf("unexpected public nodes: %#v", public["nodes"])
				}
				node := nodes[0].(map[string]any)
				position := node["position"].(map[string]any)
				if node["width"] != width || node["height"] != height || position["x"] != x || position["y"] != y {
					t.Fatalf("public share changed saved geometry: %#v", node)
				}
				metadata := node["metadata"].(map[string]any)
				if metadata["manualSize"] != layout.manualSize || metadata["locked"] != layout.locked {
					t.Fatalf("public share lost layout flags: %#v", metadata)
				}
				for _, key := range []string{"apiKey", "taskId", "storageKey", "unlistedField"} {
					if _, exists := metadata[key]; exists {
						t.Fatalf("public share retained private metadata %q", key)
					}
				}
			})
		}
	}
}

func TestCanvasResourceIDRejectsInvalidValues(t *testing.T) {
	for _, value := range []string{"resource:", "resource:../secret", "/api/resources/a%2Fb/file", "resource:" + strings.Repeat("a", 81)} {
		if got := canvasResourceID(value); got != "" {
			t.Fatalf("expected invalid resource id for %q, got %q", value, got)
		}
	}
	if got := canvasResourceID("/api/resources/abc_123/file"); got != "abc_123" {
		t.Fatalf("unexpected resource id: %q", got)
	}
}

func TestPublicCanvasProjectDropsUnmanagedMediaURL(t *testing.T) {
	payload := `{"id":"p","nodes":[{"id":"n","type":"image","title":"image","position":{"x":0,"y":0},"width":10,"height":10,"metadata":{"content":"https://tracker.example/image.png","prompt":"public prompt"}}],"connections":[]}`
	public, _, err := publicCanvasProject(&model.CanvasProject{ID: "p", PayloadJSON: payload}, "share-token")
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(public)
	if strings.Contains(string(encoded), "tracker.example") || !strings.Contains(string(encoded), "public prompt") {
		t.Fatalf("unexpected public payload: %s", encoded)
	}
}
