package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreationConversationCloudLifecycleUsesRevisionAndTombstone(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(database.Models()...); err != nil {
		t.Fatal(err)
	}
	svc := New(repository.New(db), t.TempDir())
	first := creationConversationJSON("conversation-1", "第一版", "message-1")

	created, err := svc.UpsertCreationConversation("user-1", first, 0)
	if err != nil {
		t.Fatal(err)
	}
	if created.Revision != 1 {
		t.Fatalf("created revision = %d, want 1", created.Revision)
	}
	// 响应丢失后的同内容重放必须幂等返回当前版本。
	replayed, err := svc.UpsertCreationConversation("user-1", first, 0)
	if err != nil || replayed.Revision != 1 {
		t.Fatalf("idempotent replay = %#v, %v", replayed, err)
	}
	second := creationConversationJSON("conversation-1", "第二版", "message-2")
	updated, err := svc.UpsertCreationConversation("user-1", second, created.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 2 {
		t.Fatalf("updated revision = %d, want 2", updated.Revision)
	}
	if _, err := svc.UpsertCreationConversation("user-1", creationConversationJSON("conversation-1", "过期覆盖", "message-3"), 1); !isAppStatus(err, http.StatusConflict) {
		t.Fatalf("stale update error = %v, want conflict", err)
	}
	if items, err := svc.CreationConversations("user-2"); err != nil || len(items) != 0 {
		t.Fatalf("other user conversations = %#v, %v", items, err)
	}
	if err := svc.DeleteCreationConversation("user-1", "conversation-1", updated.Revision); err != nil {
		t.Fatal(err)
	}
	if items, err := svc.CreationConversations("user-1"); err != nil || len(items) != 0 {
		t.Fatalf("deleted conversations = %#v, %v", items, err)
	}
	if _, err := svc.UpsertCreationConversation("user-1", second, updated.Revision); !isAppStatus(err, http.StatusConflict) {
		t.Fatalf("tombstone resurrection error = %v, want conflict", err)
	}
	var tombstone model.CreationConversation
	if err := db.Unscoped().First(&tombstone, "id = ?", "conversation-1").Error; err != nil || !tombstone.DeletedAt.Valid || tombstone.Revision != 3 {
		t.Fatalf("tombstone = %#v, %v", tombstone, err)
	}
}

func TestCreationConversationValidationRejectsInvalidMessages(t *testing.T) {
	for name, raw := range map[string]json.RawMessage{
		"missing title":               json.RawMessage(`{"id":"conversation-1","title":"","updatedAt":"2026-09-03T00:00:00Z","messages":[]}`),
		"duplicate ids":               json.RawMessage(`{"id":"conversation-1","title":"对话","updatedAt":"2026-09-03T00:00:00Z","messages":[{"id":"same","role":"user","content":"a","createdAt":"2026-09-03T00:00:00Z"},{"id":"same","role":"assistant","content":"b","createdAt":"2026-09-03T00:00:01Z"}]}`),
		"invalid role":                json.RawMessage(`{"id":"conversation-1","title":"对话","updatedAt":"2026-09-03T00:00:00Z","messages":[{"id":"message-1","role":"system","content":"a","createdAt":"2026-09-03T00:00:00Z"}]}`),
		"duplicate deleted ids":       json.RawMessage(`{"id":"conversation-1","title":"对话","updatedAt":"2026-09-03T00:00:00Z","deletedMessageIds":["gone","gone"],"messages":[]}`),
		"active message also deleted": json.RawMessage(`{"id":"conversation-1","title":"对话","updatedAt":"2026-09-03T00:00:00Z","deletedMessageIds":["message-1"],"messages":[{"id":"message-1","role":"user","content":"a","createdAt":"2026-09-03T00:00:00Z"}]}`),
		"inline media":                json.RawMessage(`{"id":"conversation-1","title":"对话","updatedAt":"2026-09-03T00:00:00Z","messages":[{"id":"message-1","role":"user","content":"a","createdAt":"2026-09-03T00:00:00Z","attachments":[{"dataUrl":"data:image/png;base64,AA"}]}]}`),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := validateCreationConversationPayload(raw); err == nil {
				t.Fatal("validation error = nil")
			}
		})
	}
}

func creationConversationJSON(id string, title string, messageID string) json.RawMessage {
	return json.RawMessage(`{"id":"` + id + `","title":"` + title + `","updatedAt":"2026-09-03T00:00:00Z","messages":[{"id":"` + messageID + `","role":"user","content":"开始创作","createdAt":"2026-09-03T00:00:00Z"}]}`)
}

func isAppStatus(err error, status int) bool {
	var appErr *AppError
	return errors.As(err, &appErr) && appErr.Status == status
}
