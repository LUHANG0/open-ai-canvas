package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

type taskCreateRouteFixture struct {
	db     *gorm.DB
	svc    *service.Service
	router *gin.Engine
	auth   *service.AuthSessionResult
	cookie *http.Cookie
}

func newTaskCreateRouteFixture(t *testing.T) taskCreateRouteFixture {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "task-create-errors.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(database.Models()...); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	previousRuntimeService := runtimeService
	ConfigureRuntime(svc)
	t.Cleanup(func() { runtimeService = previousRuntimeService })
	auth, err := svc.Register(service.RegisterRequest{Username: "route_tester", DisplayName: "Route Tester", Password: "strong-password"})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	RegisterTaskRoutes(router.Group("/api"), svc)
	return taskCreateRouteFixture{
		db: db, svc: svc, router: router, auth: auth,
		cookie: &http.Cookie{Name: service.SessionCookieName, Value: auth.Session, Path: "/"},
	}
}

func (fixture taskCreateRouteFixture) postTask(t *testing.T, input service.CreateTaskRequest, headerKey string) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api/tasks", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	if headerKey != "" {
		request.Header.Set("Idempotency-Key", headerKey)
	}
	request.AddCookie(fixture.cookie)
	response := httptest.NewRecorder()
	fixture.router.ServeHTTP(response, request)
	return response
}

func taskCreateTextReplayRequest(key string, prompt string) service.CreateTaskRequest {
	return service.CreateTaskRequest{
		IdempotencyKey: key,
		Type:           "canvas_text",
		Operation:      "text",
		Prompt:         prompt,
		Model:          "custom-text-model",
		Input: map[string]any{
			"replay": true,
			"mode":   "text",
			"config": map[string]any{
				"baseUrl":       "https://provider.example/v1",
				"apiKey":        "test-api-key",
				"interfaceType": "chat-completion",
				"model":         "custom-text-model",
			},
		},
	}
}

func TestCreateTaskRoutePreservesDrainingServiceUnavailable(t *testing.T) {
	fixture := newTaskCreateRouteFixture(t)
	fixture.svc.BeginDrain()
	key := "draining-task-key-0001"
	input := taskCreateTextReplayRequest("", "maintenance")
	response := fixture.postTask(t, input, key)
	failure := decodeFailureEnvelope(t, response)
	if response.Code != http.StatusServiceUnavailable || failure.Code != http.StatusServiceUnavailable || !strings.Contains(failure.Msg, "服务正在维护") {
		t.Fatalf("response = status %d, body %#v", response.Code, failure)
	}
}

func TestCreateTaskRoutePreservesIdempotencyConflict(t *testing.T) {
	fixture := newTaskCreateRouteFixture(t)
	key := "conflicting-task-key-0001"
	original := taskCreateTextReplayRequest(key, "original prompt")
	if _, err := fixture.svc.CreateTask(fixture.auth.User.ID, original); err != nil {
		t.Fatal(err)
	}
	changed := taskCreateTextReplayRequest("", "changed prompt")
	response := fixture.postTask(t, changed, key)
	failure := decodeFailureEnvelope(t, response)
	if response.Code != http.StatusConflict || failure.Code != http.StatusConflict || !strings.Contains(failure.Msg, "幂等键已用于不同") {
		t.Fatalf("response = status %d, body %#v", response.Code, failure)
	}
}

func TestCreateTaskRouteHidesUnknownInternalError(t *testing.T) {
	fixture := newTaskCreateRouteFixture(t)
	if err := fixture.db.Exec("ALTER TABLE assets RENAME TO assets_unavailable").Error; err != nil {
		t.Fatal(err)
	}
	response := fixture.postTask(t, taskCreateTextReplayRequest("internal-error-key-0001", "trigger storage query"), "")
	failure := decodeFailureEnvelope(t, response)
	if response.Code != http.StatusInternalServerError || failure.Code != http.StatusInternalServerError || failure.Msg != internalErrorMessage {
		t.Fatalf("response = status %d, body %#v", response.Code, failure)
	}
	if strings.Contains(response.Body.String(), "assets") || strings.Contains(response.Body.String(), "no such table") {
		t.Fatalf("internal database error leaked: %s", response.Body.String())
	}
}

func TestCreateTaskRouteKeepsInputErrorsAsBadRequest(t *testing.T) {
	fixture := newTaskCreateRouteFixture(t)
	response := fixture.postTask(t, service.CreateTaskRequest{IdempotencyKey: "invalid-input-key-0001", Type: "canvas_text", Prompt: ""}, "")
	failure := decodeFailureEnvelope(t, response)
	if response.Code != http.StatusBadRequest || failure.Code != http.StatusBadRequest || failure.Msg != "prompt is required" {
		t.Fatalf("response = status %d, body %#v", response.Code, failure)
	}
}
