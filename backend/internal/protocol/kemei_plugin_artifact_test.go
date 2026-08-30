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
	if pkg.Manifest.Metadata.Version != "1.0.2" {
		t.Fatalf("version = %q, want 1.0.2", pkg.Manifest.Metadata.Version)
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
}
