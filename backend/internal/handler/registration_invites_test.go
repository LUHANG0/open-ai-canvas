package handler

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRegistrationInviteExchangeCookieAttributes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open("file:handler-invite-cookie?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.RegistrationInvite{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin-1", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	ConfigureRuntime(svc)
	t.Cleanup(func() { ConfigureRuntime(nil) })
	created, err := svc.CreateRegistrationInvite(admin, service.CreateRegistrationInviteRequest{ExpiresInDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	RegisterAuthRoutes(router.Group("/api"), svc)

	request := httptest.NewRequest(http.MethodPost, "/api/auth/registration-invites/exchange", bytes.NewBufferString(`{"token":"`+created.Token+`"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("exchange status=%d body=%s", response.Code, response.Body.String())
	}
	if strings.Contains(response.Body.String(), created.Token) {
		t.Fatal("exchange body exposed raw token")
	}
	if !strings.Contains(response.Body.String(), `"creditAmountMicrocredits":100000000`) {
		t.Fatalf("exchange body missing default invite credits: %s", response.Body.String())
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies=%#v", cookies)
	}
	cookie := cookies[0]
	if cookie.Name != service.RegistrationInviteCookieName || !cookie.HttpOnly || cookie.SameSite != http.SameSiteLaxMode || cookie.Secure || cookie.Path != "/api/auth" || cookie.MaxAge <= 0 {
		t.Fatalf("unexpected invite cookie: %#v", cookie)
	}

	secureRequest := httptest.NewRequest(http.MethodPost, "/api/auth/registration-invites/exchange", bytes.NewBufferString(`{"token":"`+created.Token+`"}`))
	secureRequest.Header.Set("Content-Type", "application/json")
	secureRequest.Header.Set("X-Forwarded-Proto", "https")
	secureResponse := httptest.NewRecorder()
	router.ServeHTTP(secureResponse, secureRequest)
	if secureResponse.Code != http.StatusOK || len(secureResponse.Result().Cookies()) != 1 || !secureResponse.Result().Cookies()[0].Secure {
		t.Fatalf("https invite cookie missing Secure: status=%d headers=%v", secureResponse.Code, secureResponse.Header())
	}

	invalidRequest := httptest.NewRequest(http.MethodPost, "/api/auth/registration-invites/exchange", bytes.NewBufferString(`{"token":"invalid"}`))
	invalidRequest.Header.Set("Content-Type", "application/json")
	invalidResponse := httptest.NewRecorder()
	router.ServeHTTP(invalidResponse, invalidRequest)
	invalidCookies := invalidResponse.Result().Cookies()
	if invalidResponse.Code != http.StatusOK || len(invalidCookies) != 1 || invalidCookies[0].MaxAge >= 0 {
		t.Fatalf("invalid exchange did not clear cookie: status=%d cookies=%#v", invalidResponse.Code, invalidCookies)
	}
}
