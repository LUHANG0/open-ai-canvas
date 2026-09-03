package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestModelCatalogQuoteUsesSystemChannelWhenFrontendModelsDisabled(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "model-catalog-quote.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(database.Models()...); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	auth, err := svc.Register(service.RegisterRequest{Username: "quote_tester", DisplayName: "Quote Tester", Password: "strong-password"})
	if err != nil {
		t.Fatal(err)
	}
	channel := model.ModelChannel{ID: "system-channel-quote", UserID: auth.User.ID, Scope: model.ChannelScopeSystem, Enabled: true, Name: "System"}
	channelModel := model.ChannelModel{
		ID: "system-model-quote", ChannelID: channel.ID, ModelKey: "image-model", ProviderModelKey: "image-model",
		Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, Enabled: true, PriceConfigured: true, PriceVersion: 1,
	}
	tier := model.ChannelModelPriceTier{
		ID: "system-tier-quote", ChannelModelID: channelModel.ID, SelectorKey: `{}`, SelectorJSON: `{}`,
		Resolution: "*", ProviderModelKey: channelModel.ProviderModelKey, BillingMode: "fixed_request",
		UnitPriceMicrocredits: 2_500_000, PriceConfigured: true, Enabled: true, PriceVersion: 1,
	}
	for _, item := range []any{&channel, &channelModel, &tier} {
		if err := db.Create(item).Error; err != nil {
			t.Fatal(err)
		}
	}

	router := gin.New()
	RegisterModelCatalogRoutes(router.Group("/api"), svc)
	body, err := json.Marshal(map[string]any{
		"modelId": channelModel.ID,
		"intent":  map[string]any{"capability": "image", "operation": "text_to_image", "options": map[string]any{}},
	})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/model-catalog/quote", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: auth.Session, Path: "/"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	var envelope struct {
		Code int `json:"code"`
		Data struct {
			Quote service.SystemChannelModelQuote `json:"quote"`
		} `json:"data"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatalf("decode response: %v; body = %s", err, response.Body.String())
	}
	if response.Code != http.StatusOK || envelope.Code != 0 || envelope.Data.Quote.ChannelModelID != channelModel.ID || envelope.Data.Quote.AmountMicrocredits != tier.UnitPriceMicrocredits {
		t.Fatalf("response = status %d, body %s", response.Code, response.Body.String())
	}
}
