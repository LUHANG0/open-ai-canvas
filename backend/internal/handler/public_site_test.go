package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
	"yingce/backend/internal/publicsite"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestPublicSiteRenderMetadata404AndAdminBoundary(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://example.test")
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	raw.SetMaxOpenConns(1)
	t.Cleanup(func() { raw.Close() })
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.AdminAuditEvent{}, &model.User{}, &model.AuthSession{}); err != nil {
		t.Fatal(err)
	}
	for _, role := range []model.UserRole{model.UserRoleAdmin, model.UserRoleUser} {
		id := string(role)
		db.Create(&model.User{ID: id, Username: id, Role: role, Status: model.UserStatusActive})
		db.Create(&model.AuthSession{ID: id, UserID: id, TokenHash: auth.HashToken("seo-test"), ExpiresAt: time.Now().Add(time.Hour)})
	}
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { svc.Close() })
	router := gin.New()
	registerPublicSiteRoutes(router.Group("/api"), svc)
	call := func(role, method, path, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if role != "" {
			req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: role + ".seo-test"})
		}
		out := httptest.NewRecorder()
		router.ServeHTTP(out, req)
		return out
	}
	catalog, _ := publicsite.Default()
	for _, p := range catalog.Pages() {
		response := call("", "GET", "/public/site/render?path="+p.Path, "")
		body := response.Body.String()
		if response.Code != 200 || !strings.Contains(body, "<h1 ") || !strings.Contains(body, p.Heading) || strings.Count(body, "<title>") != 1 || !strings.Contains(body, "https://example.test"+p.Path) {
			t.Fatalf("render %s: %d %s", p.Path, response.Code, body)
		}
	}
	if call("", "HEAD", "/public/site/render?path=/tutorials/video-prompts", "").Code != 200 {
		t.Fatal("HEAD does not match public GET")
	}
	response := call("", "GET", "/public/site/render?path=/tutorials/not-published", "")
	if response.Code != 404 || response.Header().Get("X-Robots-Tag") != "noindex" {
		t.Fatal("unknown page becomes soft 404")
	}
	for _, tc := range []struct{ path, kind string }{{"/public/site/assets/site.css", "text/css"}, {"/public/site/assets/site.js", "application/javascript"}, {"/public/site/sitemap.xml", "application/xml"}, {"/public/site/robots.txt", "text/plain"}} {
		r := call("", "GET", tc.path, "")
		if r.Code != 200 || !strings.HasPrefix(r.Header().Get("Content-Type"), tc.kind) {
			t.Fatalf("public asset %s: %d", tc.path, r.Code)
		}
	}
	for _, method := range []string{"GET", "PATCH", "POST"} {
		path := "/admin/settings/seo"
		if method == "POST" {
			path += "/check"
		}
		for _, role := range []string{"", "user"} {
			r := call(role, method, path, `{}`)
			want := 403
			if role == "" {
				want = 401
			}
			if r.Code != want {
				t.Fatalf("%s %s %s: %d", method, path, role, r.Code)
			}
		}
	}
	response = call("admin", "PATCH", "/admin/settings/seo", `{"revision":0,"baiduToken":"test-secret-token"}`)
	if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" || strings.Contains(response.Body.String(), "test-secret-token") {
		t.Fatalf("config response: %d %s", response.Code, response.Body.String())
	}
	var v struct {
		Data struct {
			Setting struct {
				Revision int `json:"revision"`
			} `json:"setting"`
		} `json:"data"`
	}
	if json.Unmarshal(response.Body.Bytes(), &v) != nil || v.Data.Setting.Revision != 1 {
		t.Fatal("save not persisted")
	}
	if call("admin", "PATCH", "/admin/settings/seo", `{"revision":0}`).Code != 409 {
		t.Fatal("stale save not rejected")
	}
	if call("admin", "PATCH", "/admin/settings/seo", `{"baiduToken":"`+strings.Repeat("x", 4200)+`"}`).Code != 400 {
		t.Fatal("oversized request allowed")
	}
}
