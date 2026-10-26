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
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestTurnstileRoutesRejectNotificationBypassesAndProtectAdminSecrets(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.AuthSession{ID: "admin-session", UserID: admin.ID, TokenHash: auth.HashToken("test-session-token"), ExpiresAt: time.Now().Add(time.Hour)}).Error; err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	t.Cleanup(func() { _ = svc.Close() })
	setting := service.TurnstileSettingRequest{Enabled: true, SiteKey: "test_site_key_1234567890", SecretKey: "test_secret_key_1234567890", Hostnames: []string{"mengceng.com"}, Registration: true, PasswordReset: true, CodeLogin: true, PasswordLogin: true, LoginFailureThreshold: 3}
	if _, err := svc.UpdateTurnstileSetting(admin, setting); err != nil {
		t.Fatal(err)
	}
	previousRuntime := runtimeService
	runtimeService = svc
	t.Cleanup(func() { runtimeService = previousRuntime })
	router := gin.New()
	RegisterAuthRoutes(router.Group("/api"), svc)
	call := func(method, path, body string, withAdmin bool) *httptest.ResponseRecorder {
		req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if withAdmin {
			req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: "admin-session.test-session-token"})
		}
		response := httptest.NewRecorder()
		router.ServeHTTP(response, req)
		return response
	}
	for _, row := range []struct{ path, body string }{
		{"/auth/email-code", `{"email":"nobody@example.com"}`},
		{"/auth/password-reset-code", `{"email":"nobody@example.com"}`},
		{"/auth/verification", `{"purpose":"register","method":"email","email":"nobody@example.com"}`},
		{"/auth/verification", `{"purpose":"login","method":"sms","phone":"13800138000"}`},
		{"/auth/verification", `{"purpose":"register","method":"sms_email","email":"nobody@example.com","phone":"13800138000","invitationCode":"ABCDEF"}`},
	} {
		response := call("POST", row.path, row.body, false)
		if response.Code != 403 || !strings.Contains(response.Body.String(), `"humanVerificationRequired":true`) {
			t.Fatalf("bypass %s: %d %s", row.path, response.Code, response.Body.String())
		}
	}
	for _, table := range []string{"auth_verifications", "email_verification_codes", "notification_deliveries"} {
		if !db.Migrator().HasTable(table) {
			continue
		}
		var count int64
		if err := db.Table(table).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("challenge failure wrote %s: %d %v", table, count, err)
		}
	}
	for _, method := range []string{"GET", "PATCH"} {
		if response := call(method, "/admin/settings/turnstile", `{}`, false); response.Code != 401 {
			t.Fatalf("admin auth %s %d", method, response.Code)
		}
	}
	response := call("GET", "/admin/settings/turnstile", "", true)
	if response.Code != 200 || strings.Contains(response.Body.String(), setting.SecretKey) || strings.Contains(response.Body.String(), `"secretKey"`) {
		t.Fatalf("admin projection %d %s", response.Code, response.Body.String())
	}
	response = call("GET", "/auth/settings", "", false)
	var envelope map[string]any
	if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &envelope) != nil {
		t.Fatalf("public settings %d %s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), "SecretKey") || strings.Contains(response.Body.String(), setting.SecretKey) || strings.Contains(response.Body.String(), "hostnames") {
		t.Fatal("private setting leaked to visitors")
	}
}
