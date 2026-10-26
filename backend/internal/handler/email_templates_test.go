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
	"yingce/backend/internal/auth"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestEmailTemplateRoutesAuthorizePreviewAndSave(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.User{}, &model.AuthSession{}); err != nil {
		t.Fatal(err)
	}
	for _, role := range []model.UserRole{model.UserRoleAdmin, model.UserRoleUser} {
		id := string(role)
		if err := db.Create(&model.User{ID: id, Username: id, Role: role, Status: model.UserStatusActive}).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&model.AuthSession{ID: id, UserID: id, TokenHash: auth.HashToken("template-test"), ExpiresAt: time.Now().Add(time.Hour)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	router := gin.New()
	RegisterFinanceRoutes(router.Group("/api"), svc)
	call := func(role, method, suffix, body string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api/admin/settings/email-templates"+suffix, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if role != "" {
			req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: role + ".template-test"})
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	for _, row := range []struct{ method, suffix string }{{"GET", ""}, {"PATCH", ""}, {"POST", "/preview"}} {
		for _, role := range []string{"", "user"} {
			response := call(role, row.method, row.suffix, `{}`)
			want := http.StatusForbidden
			if role == "" {
				want = http.StatusUnauthorized
			}
			if response.Code != want {
				t.Fatalf("%s %s role=%s: %d %s", row.method, row.suffix, role, response.Code, response.Body.String())
			}
		}
	}
	response := call("admin", "GET", "", "")
	var result struct {
		Data struct {
			Setting service.PublicEmailTemplates `json:"setting"`
		} `json:"data"`
	}
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil {
		t.Fatalf("read: %d %s", response.Code, response.Body.String())
	}
	value := result.Data.Setting.Templates["register"]
	payload, _ := json.Marshal(map[string]any{"scene": "register", "template": value})
	response = call("admin", "POST", "/preview", string(payload))
	if response.Code != 200 || !strings.Contains(response.Body.String(), "123456") || !strings.Contains(response.Body.String(), `"html"`) {
		t.Fatalf("preview: %d %s", response.Code, response.Body.String())
	}
	var count int64
	db.Model(&model.SystemSetting{}).Where("key = ?", "email_templates").Count(&count)
	if count != 0 {
		t.Fatal("preview wrote configuration")
	}
	payload, _ = json.Marshal(map[string]any{"revision": 0, "templates": result.Data.Setting.Templates})
	if response := call("admin", "PATCH", "", string(payload)); response.Code != 200 {
		t.Fatalf("save: %d %s", response.Code, response.Body.String())
	}
	if response := call("admin", "PATCH", "", string(payload)); response.Code != 409 {
		t.Fatalf("stale save: %d %s", response.Code, response.Body.String())
	}
}
