package service

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestValidateChannelModelTierCapabilitiesExplainsResolutionMismatch(t *testing.T) {
	raw := `{"version":1,"video":{"duration":{"selection":"enum","values":[5],"default":5},"resolutions":["720p","1080p"]}}`
	err := validateChannelModelTierCapabilities([]model.ChannelModelPriceTier{{Resolution: "480p"}}, raw, "video")
	if err == nil {
		t.Fatal("validateChannelModelTierCapabilities() should reject an unsupported price-tier resolution")
	}
	message := err.Error()
	for _, expected := range []string{"480P", "当前支持：720P、1080P", "协议参数 > 输出分辨率"} {
		if !strings.Contains(message, expected) {
			t.Fatalf("error %q should contain %q", message, expected)
		}
	}
}

func TestChannelModelPricingHistoryRejectsStaleSaveAndRestoresAsNewVersion(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-history", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "History", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	created, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{
		ModelKey: "history-model", DisplayName: "History v1", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "history-model"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", UnitPriceMicrocredits: 10_000_000, PriceConfigured: true, Enabled: &enabled}}, Enabled: &enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	expectedV1 := created.PriceVersion
	updated, err := svc.SaveAdminChannelModel(admin, channel.ID, created.ID, ChannelModelRequest{
		ModelKey: "history-model", DisplayName: "History v2", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "history-model"),
		PriceEntryMode:   "discount", UpstreamDiscountBasisPoints: 7200, DiscountIncrementBasisPoints: 800,
		PriceTiers: []ChannelModelPriceTierRequest{{
			BillingMode: "fixed_request", UnitPriceMicrocredits: 8_000_000, OriginalUnitPriceMicrocredits: 10_000_000,
			PriceConfigured: true, Enabled: &enabled,
		}}, Enabled: &enabled, ExpectedPriceVersion: &expectedV1,
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.PriceVersion != 2 || updated.PriceEntryMode != "discount" {
		t.Fatalf("updated model = %#v", updated)
	}
	stored, err := svc.repo.ChannelModelByID(channel.ID, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(stored.PriceTiers) != 1 || stored.PriceTiers[0].OriginalUnitPriceMicrocredits != 10_000_000 {
		t.Fatalf("stored original pricing = %#v", stored.PriceTiers)
	}

	_, err = svc.SaveAdminChannelModel(admin, channel.ID, created.ID, ChannelModelRequest{
		ModelKey: "history-model", DisplayName: "stale", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "history-model"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", UnitPriceMicrocredits: 1, PriceConfigured: true, Enabled: &enabled}},
		Enabled:          &enabled, ExpectedPriceVersion: &expectedV1,
	})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != http.StatusConflict {
		t.Fatalf("stale save error = %#v, want 409", err)
	}

	revisions, err := svc.AdminChannelModelRevisions(admin, channel.ID, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(revisions) != 2 || revisions[0].Version != 2 || revisions[1].Version != 1 || revisions[1].Snapshot == nil {
		t.Fatalf("revisions = %#v", revisions)
	}
	restored, err := svc.RestoreAdminChannelModelRevision(admin, channel.ID, created.ID, revisions[1].ID, ChannelModelRestoreRequest{ExpectedPriceVersion: updated.PriceVersion})
	if err != nil {
		t.Fatal(err)
	}
	if restored.PriceVersion != 3 || restored.DisplayName != "History v1" || restored.PriceEntryMode != "direct" {
		t.Fatalf("restored model = %#v", restored)
	}
	revisions, err = svc.AdminChannelModelRevisions(admin, channel.ID, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(revisions) != 3 || revisions[0].Action != "restore" || revisions[0].RestoredFromRevisionID != revisions[2].ID {
		t.Fatalf("restored revisions = %#v", revisions)
	}
	var auditCount int64
	if err := db.Model(&model.AdminAuditEvent{}).Where("target_type = ? AND target_id = ?", "channel_model", created.ID).Count(&auditCount).Error; err != nil {
		t.Fatal(err)
	}
	if auditCount != 3 {
		t.Fatalf("audit count = %d, want 3", auditCount)
	}
}

func TestValidateChannelModelTierCapabilitiesNormalizesResolutionAliases(t *testing.T) {
	raw := `{"version":1,"video":{"duration":{"selection":"enum","values":[5],"default":5},"resolutions":["480P","720P","1080P"]}}`
	for _, resolution := range []string{"480", "480p", "480P", "low"} {
		if err := validateChannelModelTierCapabilities([]model.ChannelModelPriceTier{{Resolution: resolution}}, raw, "video"); err != nil {
			t.Fatalf("resolution alias %q should be supported: %v", resolution, err)
		}
	}
}

func TestValidateKemeiChannelModelTierCapabilitiesSupportsHD2KAnd4K(t *testing.T) {
	raw := `{"version":1,"video":{"duration":{"selection":"range","min":1,"max":15,"step":1,"default":6},"resolutions":["480p","720p","1080p","2K","4K"]}}`
	for _, resolution := range []string{"480P", "720P", "1080P", "1440p", "2K", "2160p", "4K"} {
		if err := validateChannelModelTierCapabilities([]model.ChannelModelPriceTier{{Resolution: resolution}}, raw, "video"); err != nil {
			t.Fatalf("Kemei price-tier resolution alias %q should be supported: %v", resolution, err)
		}
	}
}

func TestNormalizeChannelModelContract(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "test-key"}
	modelKey, providerModelKey, capability, protocol, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "models/gpt-test", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
	})
	if err != nil {
		t.Fatalf("normalizeChannelModelContract() error = %v", err)
	}
	if modelKey != "gpt-test" || providerModelKey != "gpt-test" || capability != "text" || protocol != model.ChannelInterfaceChatCompletion {
		t.Fatalf("contract = %q, %q, %q, %q", modelKey, providerModelKey, capability, protocol)
	}
}

func TestNormalizeChannelModelContractPreservesProviderModelKey(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "test-key"}
	modelKey, providerModelKey, _, _, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "seedance-2-5-480p", ProviderModelKey: "models/doubao-seedance-2-5", Capability: "video", Protocol: string(model.ChannelInterfaceVolcengineArkVideo),
	})
	if err != nil {
		t.Fatalf("normalizeChannelModelContract() error = %v", err)
	}
	if modelKey != "seedance-2-5-480p" || providerModelKey != "doubao-seedance-2-5" {
		t.Fatalf("contract = %q, %q", modelKey, providerModelKey)
	}
}

func TestNormalizeChannelModelContractRejectsCapabilityMismatch(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "test-key"}
	_, _, _, _, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "image-test", Capability: "text", Protocol: string(model.ChannelInterfaceOpenAIImage),
	})
	if err == nil {
		t.Fatal("normalizeChannelModelContract() should reject a mismatched capability")
	}
}

func TestNormalizeChannelModelContractRequiresJiMengSecret(t *testing.T) {
	channel := &model.ModelChannel{APIKey: "access-key"}
	_, _, _, _, err := normalizeChannelModelContract(channel, ChannelModelRequest{
		ModelKey: "jimeng-test", Capability: "image", Protocol: string(model.ChannelInterfaceVolcengineJiMengImage),
	})
	if err == nil {
		t.Fatal("normalizeChannelModelContract() should require JiMeng credentials")
	}
}

func TestSaveAdminChannelModelPersistsAndPublishesIcon(t *testing.T) {
	svc, db := newChannelModelTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	channel := model.ModelChannel{ID: "channel-1", UserID: admin.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "Test", BaseURL: "https://example.com/v1", APIKey: "key", APIFormat: "openai", ModelsJSON: `[]`}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	enabled := true
	saved, err := svc.SaveAdminChannelModel(admin, channel.ID, "", ChannelModelRequest{
		ModelKey: "gpt-test", DisplayName: "GPT Test", Icon: "OpenAI", Capability: "text", Protocol: string(model.ChannelInterfaceChatCompletion),
		CapabilityConfig: DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "gpt-test"),
		PriceTiers:       []ChannelModelPriceTierRequest{{BillingMode: "fixed_request", PriceConfigured: true, Enabled: &enabled}}, Enabled: &enabled,
	})
	if err != nil {
		t.Fatal(err)
	}
	if saved.Icon != "OpenAI" {
		t.Fatalf("saved icon = %q, want OpenAI", saved.Icon)
	}
	var stored model.ChannelModel
	if err := db.First(&stored, "id = ?", saved.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.Icon != "OpenAI" {
		t.Fatalf("stored icon = %q, want OpenAI", stored.Icon)
	}
	if public := svc.sanitizeChannelModel(saved); public.Icon != "OpenAI" {
		t.Fatalf("public icon = %q, want OpenAI", public.Icon)
	}
	legacyPublic := publicChannel(channel, false, []model.ChannelModel{*saved})
	if len(legacyPublic.ModelCosts) != 1 || legacyPublic.ModelCosts[0].Icon != "OpenAI" {
		t.Fatalf("legacy public model costs = %#v", legacyPublic.ModelCosts)
	}
}

func TestImageTestDefaultsUseModelCapability(t *testing.T) {
	tests := []struct {
		name        string
		profile     *ImageCapabilityConfig
		wantSize    string
		wantQuality string
	}{
		{name: "legacy fallback", wantSize: "1024x1024", wantQuality: "auto"},
		{
			name: "fixed 2k model",
			profile: &ImageCapabilityConfig{
				Size:    ImageSizeConfig{Parameter: "size", Default: "2048x2048"},
				Quality: ImageQualityConfig{Supported: false, Default: "auto"},
			},
			wantSize: "2048x2048",
		},
		{
			name: "provider selected size",
			profile: &ImageCapabilityConfig{
				Size:    ImageSizeConfig{Parameter: "none", Default: "auto"},
				Quality: ImageQualityConfig{Supported: false},
			},
		},
		{
			name: "gpt image capability",
			profile: &ImageCapabilityConfig{
				Size:    ImageSizeConfig{Parameter: "size", Default: "1024x1536"},
				Quality: ImageQualityConfig{Supported: true, Default: "high"},
			},
			wantSize: "1024x1536", wantQuality: "high",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			size, quality := imageTestDefaults(test.profile)
			if size != test.wantSize || quality != test.wantQuality {
				t.Fatalf("imageTestDefaults() = %q, %q; want %q, %q", size, quality, test.wantSize, test.wantQuality)
			}
		})
	}
}
