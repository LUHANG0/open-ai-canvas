package handler

import (
	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"net/http/httptest"
	"strings"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestBrandSitePublicRoutesNeverExposeDraft(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	raw.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = raw.Close() })
	if err = db.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	draftState, err := svc.AdminBrandSite(&model.User{ID: "test-admin", Role: model.UserRoleAdmin})
	if err != nil {
		t.Fatal(err)
	}
	content := &draftState.Draft
	content.Title = "private-draft-sentinel"
	content.Sections[0].Visible = false
	content.Sections[0].Title = "hidden-section-sentinel"
	if _, err = svc.ChangeBrandSite(&model.User{ID: "test-admin", Role: model.UserRoleAdmin}, "draft", service.BrandSiteChange{Content: *content}); err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	registerBrandSiteRoutes(router.Group("/api"), svc)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/public/brand-site", nil))
	if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(response.Body.String(), "private-draft-sentinel") || strings.Contains(response.Body.String(), `"draft"`) {
		t.Fatalf("public draft leak: %d %s", response.Code, response.Body.String())
	}
	for _, request := range []struct{ method, path string }{{"GET", "/api/admin/settings/brand-site"}, {"POST", "/api/admin/settings/brand-site/publish"}, {"GET", "/api/admin/settings/brand-site/media/missing"}} {
		response = httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(request.method, request.path, strings.NewReader(`{"revision":0}`)))
		if response.Code != 401 {
			t.Fatalf("anonymous %s %s got %d", request.method, request.path, response.Code)
		}
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/public/brand-site/media/missing", nil))
	if response.Code != 404 {
		t.Fatalf("unpublished media got %d", response.Code)
	}
	state, err := svc.AdminBrandSite(&model.User{ID: "test-admin", Role: model.UserRoleAdmin})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = svc.ChangeBrandSite(&model.User{ID: "test-admin", Role: model.UserRoleAdmin}, "publish", service.BrandSiteChange{Revision: state.Revision}); err != nil {
		t.Fatal(err)
	}
	response = httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest("GET", "/api/public/brand-site", nil))
	if !strings.Contains(response.Body.String(), "private-draft-sentinel") || strings.Contains(response.Body.String(), "hidden-section-sentinel") {
		t.Fatal("published/hidden boundary incorrect")
	}
}
