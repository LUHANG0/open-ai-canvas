package canvas

import (
	"encoding/json"
	"strings"
	"testing"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
)

func TestMediaVersionsKeepHistoricalResourceAndPosterReferences(t *testing.T) {
	raw := `{"nodes":[{"id":"node","type":"image","metadata":{"mediaVersions":[{"id":"v1","media":{"storageKey":"resource:old","videoPreview":{"storageKey":"resource:poster"}}}]}}]}`
	refs, err := assets.CollectDocumentResourceReferences(raw)
	if err != nil || len(refs) != 2 {
		t.Fatalf("historical references = %#v, %v", refs, err)
	}
	for _, ref := range refs {
		if ref.NodeID != "node" || !strings.Contains(ref.Path, "mediaVersions[0].media.") {
			t.Fatalf("historical reference lost node/path: %#v", ref)
		}
	}
}

func TestMediaVersionsValidateOwnershipAndReadiness(t *testing.T) {
	svc := newCanvasOperationTestService(t)
	for _, resource := range []model.Resource{
		{ID: "owned-old", UserID: "user", Status: model.ResourceStatusReady},
		{ID: "foreign-old", UserID: "other", Status: model.ResourceStatusReady},
		{ID: "pending-old", UserID: "user", Status: "pending"},
	} {
		if err := svc.repo.Create(&resource); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{"owned-old", "foreign-old", "pending-old", "missing-old"} {
		raw := json.RawMessage(`{"nodes":[{"id":"node","type":"image","metadata":{"mediaVersions":[{"id":"v1","media":{"storageKey":"resource:` + id + `"}}]}}]}`)
		err := svc.ValidateCanvasMediaAssets("user", raw)
		if (id == "owned-old") != (err == nil) {
			t.Fatalf("historical resource %s: %v", id, err)
		}
	}
}

func TestMediaVersionsRoundTripThroughCanvasOperationsAndRetry(t *testing.T) {
	svc := newCanvasOperationTestService(t)
	initial := `{"nodes":[{"id":"node","type":"image","metadata":{"content":"/new.png","prompt":"next prompt"}}],"connections":[]}`
	if err := svc.repo.Create(&model.CanvasProject{ID: "canvas", UserID: "user", PayloadJSON: initial}); err != nil {
		t.Fatal(err)
	}
	versions := json.RawMessage(`[{"id":"v1","number":1,"source":"generate","media":{"content":"/old.png"},"generation":{"resultRecord":{"mediaKey":"/old.png","taskId":"old-task","model":"old-model","billing":{"actualAmountMicrocredits":120000,"scope":"result"}}}}]`)
	request := CanvasOperationsRequest{MutationID: "history-edit", Operations: []CanvasOperation{{Type: "patch_node", ID: "node", Patch: map[string]json.RawMessage{"metadata.mediaVersions": versions, "metadata.currentMediaVersionId": json.RawMessage(`"v1"`), "metadata.content": json.RawMessage(`"/old.png"`)}, Before: map[string]json.RawMessage{"metadata.mediaVersions": json.RawMessage(`null`), "metadata.currentMediaVersionId": json.RawMessage(`null`), "metadata.content": json.RawMessage(`"/new.png"`)}}}}
	first, err := svc.ApplyUserCanvasOperations("user", "canvas", request)
	if err != nil {
		t.Fatal(err)
	}
	second, err := svc.ApplyUserCanvasOperations("user", "canvas", request)
	if err != nil || second.Revision != first.Revision {
		t.Fatalf("same-mutation retry: %#v %v", second, err)
	}
	saved, err := svc.repo.CanvasProjectForUser("user", "canvas")
	if err != nil {
		t.Fatal(err)
	}
	var document struct {
		Nodes []struct {
			Metadata struct {
				Prompt   string          `json:"prompt"`
				Content  string          `json:"content"`
				Current  string          `json:"currentMediaVersionId"`
				Versions json.RawMessage `json:"mediaVersions"`
			} `json:"metadata"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal([]byte(saved.PayloadJSON), &document); err != nil {
		t.Fatal(err)
	}
	metadata := document.Nodes[0].Metadata
	if metadata.Prompt != "next prompt" || metadata.Content != "/old.png" || metadata.Current != "v1" || !strings.Contains(string(metadata.Versions), `"actualAmountMicrocredits":120000`) {
		t.Fatalf("history round-trip: %s", saved.PayloadJSON)
	}
}
