package app

import (
	"context"
	"encoding/json"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/protocol"
)

func TestDramaImageResolutionQualityAndCountUseOneContract(t *testing.T) {
	registry := loadOfficialFallbackRegistry()
	for _, id := range []string{"drama-image", "drama-gemini-image"} {
		t.Run(id, func(t *testing.T) {
			profile, err := NormalizeModelCapabilityConfigForModel("image", id, "model", DefaultModelCapabilityConfigForModel(id, "model"), registry)
			if err != nil {
				t.Fatal(err)
			}
			if profile.Image.MaxOutputs != 128 || !profile.Image.Resolution.Supported {
				t.Fatalf("profile=%#v", profile.Image)
			}
			config := providerConfig{Model: "model", InterfaceType: id, Size: "16:9", ImageResolution: "4k", Quality: "medium", Count: "128"}
			if id == "drama-gemini-image" {
				config.Quality = ""
			}
			if err := applyImageParameterValues(&config, profile.Image); err != nil {
				t.Fatal(err)
			}
			input := canvasGenerationInput{Mode: "image", Prompt: "draw", Config: config, ImageCapability: profile.Image}
			if err := validateImageTask(profile.Image, input); err != nil {
				t.Fatal(err)
			}
			adapter, _ := registry.Resolve(id)
			spec, err := adapter.BuildCreate(context.Background(), protocol.RequestContext{Request: protocolRequestFromInput(input)})
			if err != nil {
				t.Fatal(err)
			}
			data, _ := json.Marshal(spec.Body)
			var body map[string]any
			json.Unmarshal(data, &body)
			if body["n"] != float64(128) || body["resolution"] != nil || body["imageSize"] != nil {
				t.Fatalf("body=%#v", body)
			}
			if id == "drama-image" && (body["size"] != "3840x2160" || body["quality"] != "medium") {
				t.Fatalf("GPT fields conflated=%#v", body)
			}
			if id == "drama-gemini-image" && (body["size"] != "16:9" || body["quality"] != "high") {
				t.Fatalf("Gemini fields=%#v", body)
			}
			config.Count = "129"
			config.ImageParameters = nil
			if err := applyImageParameterValues(&config, profile.Image); err == nil {
				t.Fatal("out-of-contract count accepted")
			}
			for i := range profile.Image.Parameters {
				if profile.Image.Parameters[i].Name == "count" {
					maximum := 129.0
					profile.Image.Parameters[i].Max = &maximum
				}
			}
			if _, err := NormalizeModelCapabilityConfigForModel("image", id, "model", profile, registry); err == nil {
				t.Fatal("administrator expanded plugin count limit")
			}
		})
	}
	legacy := DefaultImageCapabilityConfig("chat-completion", "model")
	legacy.MaxOutputs = 101
	if err := validateImageCapabilityConfig(legacy); err == nil {
		t.Fatal("legacy ceiling changed")
	}
}

func TestDramaImageUpgradePreservesAdministratorChoices(t *testing.T) {
	registry := loadOfficialFallbackRegistry()
	adapter, ok := registry.Resolve("drama-image")
	if !ok {
		t.Fatal("Drama image adapter unavailable")
	}
	image := DefaultImageCapabilityConfig("drama-image", "gpt-image-2.5-sunburst")
	image.Parameters = nil
	for _, field := range adapter.Metadata().ImageParameters {
		if field.Name == "imageResolution" {
			continue
		}
		switch field.Name {
		case "size":
			field.Encoding = ""
			field.Values = []any{"1:1", "16:9"}
			field.Default = "16:9"
		case "count":
			maximum := 100.0
			field.Max = &maximum
		case "quality":
			field.Values = []any{"low", "medium", "high"}
			field.Default = "medium"
		}
		image.Parameters = append(image.Parameters, field)
	}
	if err := projectImageParameters(image); err != nil {
		t.Fatal(err)
	}
	image.Size.Presets = nil
	profile, err := NormalizeModelCapabilityConfigForModel("image", "drama-image", "gpt-image-2.5-sunburst", &ModelCapabilityConfig{Version: 1, Image: image}, registry)
	if err != nil {
		t.Fatal(err)
	}
	if profile.Image.MaxOutputs != 100 || profile.Image.Quality.Default != "medium" || profile.Image.Size.Default != "16:9" || len(profile.Image.Size.Presets) != 6 || !profile.Image.Resolution.Supported {
		t.Fatalf("upgrade lost settings: %#v", profile.Image)
	}
	encoded, _ := json.Marshal(profile)
	var reopened ModelCapabilityConfig
	json.Unmarshal(encoded, &reopened)
	if _, err := NormalizeModelCapabilityConfigForModel("image", "drama-image", "gpt-image-2.5-sunburst", &reopened, registry); err != nil {
		t.Fatal(err)
	}
}

func TestDramaImage128ConfigurationSavesAndReloads(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	var err error
	svc.pluginRuntime, err = newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "drama-test", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Drama Test", BaseURL: "https://drama.dafeiyangapi.top", APIKey: "test-key", APIFormat: "openai", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	saved, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{ModelKey: "gpt-image-2.5-sunburst", Capability: "image", Protocol: "drama-image", CapabilityConfig: DefaultModelCapabilityConfigForModel("drama-image", "gpt-image-2.5-sunburst"), PriceTiers: []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", PriceConfigured: true, Enabled: &enabled}}, Enabled: &enabled})
	if err != nil {
		t.Fatal(err)
	}
	var stored model.ChannelModel
	if err := db.First(&stored, "id = ?", saved.ID).Error; err != nil {
		t.Fatal(err)
	}
	profile, err := normalizedChannelModelCapability(&stored, svc.protocolRegistry())
	if err != nil {
		t.Fatal(err)
	}
	if profile.Image.MaxOutputs != 128 || !profile.Image.Resolution.Supported || len(profile.Image.Size.Presets) != 18 {
		t.Fatalf("stored=%#v", profile.Image)
	}
}

func TestDramaVideoSavedCapabilitiesCannotExceedAContract(t *testing.T) {
	for _, name := range []string{"seedance2.0-A", "seedance2.5-A"} {
		profile := DefaultModelCapabilityConfigForModel("drama-seedance-a", name)
		if _, err := NormalizeModelCapabilityConfigForModel("video", "drama-seedance-a", name, profile); err != nil {
			t.Fatal(err)
		}
	}
	for _, test := range []struct {
		name   string
		change func(*VideoCapabilityConfig)
	}{
		{"2.5_1080p", func(v *VideoCapabilityConfig) { v.Resolutions = append(v.Resolutions, "1080p") }},
		{"2.5_auto", func(v *VideoCapabilityConfig) { v.Ratios = append(v.Ratios, "Auto") }},
		{"2.5_duration", func(v *VideoCapabilityConfig) { v.Duration.Max = 31 }},
		{"2.5_audio_switch", func(v *VideoCapabilityConfig) { v.GenerateAudio.Supported = true }},
		{"2.5_reference_limit", func(v *VideoCapabilityConfig) { v.References.MaxImages = 31 }},
		{"2.5_missing_resolution", func(v *VideoCapabilityConfig) { v.Resolutions = []string{}; v.DefaultResolution = "" }},
	} {
		t.Run(test.name, func(t *testing.T) {
			profile := DefaultModelCapabilityConfigForModel("drama-seedance-a", "seedance2.5-A")
			test.change(profile.Video)
			if _, err := NormalizeModelCapabilityConfigForModel("video", "drama-seedance-a", "seedance2.5-A", profile); err == nil {
				t.Fatal("unsupported capability saved")
			}
		})
	}
}
