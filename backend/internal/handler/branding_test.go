package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestPublicBrandingUsesETagWithoutAuthentication(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	router := gin.New()
	RegisterBrandingRoutes(router.Group("/api"), svc)

	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/public/branding", nil)
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	if response.Header().Get("ETag") != `"branding-0"` || response.Header().Get("Cache-Control") != "public, no-cache" {
		t.Fatalf("headers = %+v", response.Header())
	}

	cached := httptest.NewRecorder()
	cachedRequest := httptest.NewRequest(http.MethodGet, "/api/public/branding", nil)
	cachedRequest.Header.Set("If-None-Match", response.Header().Get("ETag"))
	router.ServeHTTP(cached, cachedRequest)
	if cached.Code != http.StatusNotModified || cached.Body.Len() != 0 {
		t.Fatalf("cached response = %d %q", cached.Code, cached.Body.String())
	}
}
