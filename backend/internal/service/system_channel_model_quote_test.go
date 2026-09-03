package service

import (
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestQuoteSystemChannelModelMatchesTaskBilling(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.ModelChannel{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}); err != nil {
		t.Fatal(err)
	}
	channel := model.ModelChannel{ID: "system-channel-1", Scope: model.ChannelScopeSystem, Enabled: true, Name: "System"}
	channelModel := model.ChannelModel{
		ID: "channel-model-1", ChannelID: channel.ID, ModelKey: "image-model", ProviderModelKey: "image-model",
		Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, Enabled: true, PriceConfigured: true, PriceVersion: 1,
	}
	tier := model.ChannelModelPriceTier{
		ID: "tier-2k", ChannelModelID: channelModel.ID, SelectorKey: `{"quality":"2k"}`, SelectorJSON: `{"quality":"2k"}`,
		Resolution: "*", ProviderModelKey: channelModel.ProviderModelKey, BillingMode: "fixed_request",
		UnitPriceMicrocredits: 4_000_000, PriceConfigured: true, Enabled: true, PriceVersion: 1,
	}
	for _, item := range []any{&channel, &channelModel, &tier} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := New(repository.New(db), t.TempDir())
	intent := ModelRequestIntent{Capability: "image", Operation: "text_to_image", Options: map[string]any{"quality": "2K"}}

	quote, err := svc.QuoteSystemChannelModel(channelModel.ID, intent)
	if err != nil {
		t.Fatalf("QuoteSystemChannelModel() error = %v", err)
	}
	order, err := svc.taskBillingOrder("user-1", &model.Task{ID: "task-1", Type: "canvas_image", Operation: "text_to_image"}, map[string]any{
		"mode": "image",
		"config": map[string]any{
			"channelId": channel.ID,
			"model":     channelModel.ModelKey,
			"quality":   "2K",
		},
	})
	if err != nil {
		t.Fatalf("taskBillingOrder() error = %v", err)
	}
	if quote.ChannelModelID != channelModel.ID || quote.BillingMode != tier.BillingMode || quote.Quantity != order.Quantity || quote.AmountMicrocredits != order.AmountMicrocredits || quote.Estimated {
		t.Fatalf("quote = %#v, billing order = %#v", quote, order)
	}
}

func TestQuoteSystemChannelModelRejectsUnavailableSelections(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.ModelChannel{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}); err != nil {
		t.Fatal(err)
	}
	channel := model.ModelChannel{ID: "disabled-system-channel", Scope: model.ChannelScopeSystem, Enabled: false, Name: "Disabled"}
	channelModel := model.ChannelModel{ID: "channel-model-disabled-parent", ChannelID: channel.ID, ModelKey: "image-model", Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, Enabled: true}
	if err := db.Create(&channel).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&channelModel).Error; err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), t.TempDir())

	for _, test := range []struct {
		name   string
		intent ModelRequestIntent
	}{
		{name: "disabled parent", intent: ModelRequestIntent{Capability: "image"}},
		{name: "capability mismatch", intent: ModelRequestIntent{Capability: "video"}},
	} {
		t.Run(test.name, func(t *testing.T) {
			_, err := svc.QuoteSystemChannelModel(channelModel.ID, test.intent)
			if err == nil || !strings.Contains(err.Error(), "暂时不可用") {
				t.Fatalf("QuoteSystemChannelModel() error = %v, want unavailable selection", err)
			}
		})
	}
}
