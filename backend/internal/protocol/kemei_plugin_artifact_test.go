package protocol

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestKemeiPluginArtifactNormalizesResolution(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", "kemei-video.yingce-plugin"))
	if err != nil {
		t.Fatal(err)
	}
	pkg, err := ParsePluginPackage(data)
	if err != nil {
		t.Fatal(err)
	}
	if pkg.Manifest.Metadata.Version != "1.1.0" {
		t.Fatalf("version = %q, want 1.1.0", pkg.Manifest.Metadata.Version)
	}
	provider := pkg.Manifest.Contributes.Providers[0]
	if provider.BaseURL != "" {
		t.Fatalf("default Base URL = %q, want empty", provider.BaseURL)
	}
	if provider.Create.Fields["resolution"] != "request.resolution|resolution_p" {
		t.Fatalf("resolution mapping = %q", provider.Create.Fields["resolution"])
	}
	adapters, err := LoadInstalledProviders(pkg.ManifestRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !adapters[0].Metadata().TokenUsage {
		t.Fatal("Kemei provider should declare real Token usage support")
	}
	spec, err := adapters[0].BuildCreate(context.Background(), RequestContext{Request: GenerationRequest{
		Model: "artsdance-2-0-mini-260801", Prompt: "test", Resolution: "480", Duration: 4,
		Images: []MediaReference{{URL: "https://cdn.example/reference.png"}},
	}})
	if err != nil {
		t.Fatal(err)
	}
	body := spec.Body.(map[string]any)
	if body["resolution"] != "480p" {
		t.Fatalf("resolution = %#v, want 480p", body["resolution"])
	}
	images, ok := body["images"].([]string)
	if !ok || len(images) != 1 || images[0] != "https://cdn.example/reference.png" {
		t.Fatalf("images = %#v", body["images"])
	}
	completed, err := adapters[0].ParseCreate(context.Background(), []byte(`{"id":"task-1","status":"completed","data":[{"url":"https://cdn.example/video.mp4"}],"usage":{"completion_tokens":65829,"total_tokens":65829}}`))
	if err != nil {
		t.Fatal(err)
	}
	if completed.Result == nil || completed.Result.Usage["completion_tokens"] != float64(65829) {
		t.Fatalf("Kemei usage = %#v", completed.Result)
	}
	wrapped, err := adapters[0].ParsePoll(context.Background(), PollContext{TaskID: "task-platform-id"}, []byte(`{"code":"success","data":{"id":251938,"task_id":"task-platform-id","status":"SUCCESS","data":{"id":"task-platform-id","status":"succeeded","content":{"video_url":"https://cdn.example/wrapped.mp4"},"usage":{"completion_tokens":108900,"total_tokens":108900}}}}`))
	if err != nil {
		t.Fatal(err)
	}
	if wrapped.Status != StatusSucceeded || wrapped.Result == nil || len(wrapped.Result.Videos) != 1 || wrapped.Result.Videos[0].URL != "https://cdn.example/wrapped.mp4" || wrapped.Result.Usage["total_tokens"] != float64(108900) {
		t.Fatalf("wrapped Kemei response = %#v", wrapped)
	}
}
