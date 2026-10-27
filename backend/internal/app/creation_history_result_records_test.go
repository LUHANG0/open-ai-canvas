package app

import (
	"encoding/json"
	"testing"

	"yingce/backend/internal/model"
)

func TestCreationHistoryResultRecordsReadbackAndIsolation(t *testing.T) {
	s, db := historyTestService(t)
	for _, row := range []any{&model.Resource{ID: "r1", UserID: "u1", Status: model.ResourceStatusReady}, &model.Resource{ID: "r2", UserID: "u2", Status: model.ResourceStatusReady}, &model.Task{ID: "t1", UserID: "u1"}, &model.Task{ID: "t2", UserID: "u2"}} {
		if err := db.Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}
	message := historyMessage("m1", "result", 0)
	message.Data["resultStorageKeys"] = []any{"resource:r1"}
	message.Data["taskIds"] = []any{"t1"}
	record := map[string]any{"mediaKey": "resource:r1", "taskId": "t1", "model": "Public model", "createdAt": "2026-10-25T00:00:00Z", "completedAt": "2026-10-25T00:02:00Z", "includesSave": true, "width": float64(1280), "height": float64(720), "outputCount": float64(1), "billing": map[string]any{"actualAmountMicrocredits": float64(0), "scope": "result"}}
	message.Data["resultRecords"] = []any{record}
	first := syncHistory(t, s, "result-history", CreationHistoryMutation{Messages: []CreationHistoryMessage{message}})
	readback, err := s.GetCreationHistory("u1", "result-history")
	if err != nil {
		t.Fatal(err)
	}
	encoded, _ := json.Marshal(readback.Messages[0].Data["resultRecords"])
	var got []map[string]any
	if err := json.Unmarshal(encoded, &got); err != nil || got[0]["billing"].(map[string]any)["actualAmountMicrocredits"] != float64(0) {
		t.Fatalf("lost explicit settled zero: %s, %v", encoded, err)
	}
	if _, err := s.GetCreationHistory("u2", "result-history"); err == nil {
		t.Fatal("other account read result metadata")
	}
	message.Revision = first.Messages[0].Revision
	for _, patch := range []map[string]any{
		{"mediaKey": "resource:r2"}, {"taskId": "t2"}, {"apiKey": "test-only"}, {"url": "blob:temporary"},
		{"billing": map[string]any{"actualAmountMicrocredits": float64(-1), "scope": "result"}},
		{"billing": map[string]any{"amountMicrocredits": float64(99), "scope": "result"}},
	} {
		invalid := map[string]any{}
		for key, value := range record {
			invalid[key] = value
		}
		for key, value := range patch {
			invalid[key] = value
		}
		message.Data["resultRecords"] = []any{invalid}
		if _, err := s.SyncCreationHistory("u1", "result-history", CreationHistoryMutation{Messages: []CreationHistoryMessage{message}}); err == nil {
			t.Fatal("accepted unbound, private or invalid result metadata")
		}
	}
	// Even matching message references must pass the existing server ownership checks.
	message.Data["resultStorageKeys"] = []any{"resource:r2"}
	message.Data["taskIds"] = []any{"t2"}
	message.Data["resultRecords"] = []any{map[string]any{"mediaKey": "resource:r2", "taskId": "t2"}}
	if _, err := s.SyncCreationHistory("u1", "result-history", CreationHistoryMutation{Messages: []CreationHistoryMessage{message}}); err == nil {
		t.Fatal("accepted other account result references")
	}
}
