package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/repository"
	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreationConversationRoutesPersistPerAccountAndRejectStaleWrite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "creation-conversations.db")), &gorm.Config{})
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
	auth, err := svc.Register(service.RegisterRequest{Username: "creation_sync", DisplayName: "Creation Sync", Password: "strong-password"})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	RegisterUserDataRoutes(router.Group("/api"), svc)
	conversation := map[string]any{
		"id": "conversation-route-1", "title": "云端对话", "updatedAt": "2026-09-03T00:00:00Z",
		"messages": []map[string]any{{"id": "message-1", "role": "user", "content": "开始", "createdAt": "2026-09-03T00:00:00Z"}},
	}

	created := performCreationConversationRequest(t, router, auth.Session, http.MethodPut, "/api/creation-conversations/conversation-route-1", map[string]any{"conversation": conversation, "expectedRevision": 0})
	if created.Code != http.StatusOK {
		t.Fatalf("create response = %d %s", created.Code, created.Body.String())
	}
	listed := performCreationConversationRequest(t, router, auth.Session, http.MethodGet, "/api/creation-conversations", nil)
	if listed.Code != http.StatusOK || !bytes.Contains(listed.Body.Bytes(), []byte("conversation-route-1")) {
		t.Fatalf("list response = %d %s", listed.Code, listed.Body.String())
	}
	conversation["title"] = "过期覆盖"
	stale := performCreationConversationRequest(t, router, auth.Session, http.MethodPut, "/api/creation-conversations/conversation-route-1", map[string]any{"conversation": conversation, "expectedRevision": 0})
	if stale.Code != http.StatusConflict {
		t.Fatalf("stale response = %d %s", stale.Code, stale.Body.String())
	}
	deleted := performCreationConversationRequest(t, router, auth.Session, http.MethodDelete, "/api/creation-conversations/conversation-route-1?revision=1", nil)
	if deleted.Code != http.StatusOK {
		t.Fatalf("delete response = %d %s", deleted.Code, deleted.Body.String())
	}
	listed = performCreationConversationRequest(t, router, auth.Session, http.MethodGet, "/api/creation-conversations", nil)
	if listed.Code != http.StatusOK || bytes.Contains(listed.Body.Bytes(), []byte("conversation-route-1")) {
		t.Fatalf("deleted list response = %d %s", listed.Code, listed.Body.String())
	}
}

func performCreationConversationRequest(t *testing.T, router http.Handler, session string, method string, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var encoded []byte
	var err error
	if body != nil {
		encoded, err = json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
	}
	request := httptest.NewRequest(method, path, bytes.NewReader(encoded))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: service.SessionCookieName, Value: session, Path: "/"})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	return response
}
