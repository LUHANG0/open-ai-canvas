package service

import (
	"encoding/json"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestTaskForOutputRedactsRoutingAndSecrets(t *testing.T) {
	task := model.Task{
		InputJSON:              `{"mode":"image","metadata":{"source":"create-page"},"config":{"apiKey":"secret"},"resourceId":"resource-1"}`,
		LogicalModelRevisionID: "revision-1",
		RouteID:                "route-1",
		ChannelModelID:         "channel-model-1",
	}

	output := taskForOutput(task)
	if output.LogicalModelRevisionID != "" || output.RouteID != "" || output.ChannelModelID != "" {
		t.Fatalf("internal routing fields leaked: %+v", output)
	}
	var input map[string]any
	if err := json.Unmarshal([]byte(output.InputJSON), &input); err != nil {
		t.Fatalf("public input is not valid JSON: %v", err)
	}
	if _, exists := input["config"]; exists {
		t.Fatal("provider config must not be exposed")
	}
	if input["resourceId"] != "resource-1" {
		t.Fatalf("resource identity was not preserved: %#v", input)
	}
}

func TestTaskMediaPreviewUsesSafeMediaURLs(t *testing.T) {
	previewURL, previewKind := taskMediaPreview(`{"images":["data:image/png;base64,AAAA","/api/resources/resource-1/file"],"video":"https://cdn.example.com/output.mp4"}`, "video")
	if previewURL != "/api/resources/resource-1/file" || previewKind != "image" {
		t.Fatalf("unexpected preview: url=%q kind=%q", previewURL, previewKind)
	}
	if previewURL, _ := taskMediaPreview(`{"url":"file:///tmp/output.mp4"}`, "video"); previewURL != "" {
		t.Fatalf("unsafe local URL was exposed: %q", previewURL)
	}
}

func TestTaskClientContextRequiresCreatePageMetadata(t *testing.T) {
	valid := taskClientContext(`{"metadata":{"source":"create-page","conversationId":"conversation-1","messageId":"message-1","batchIndex":2,"batchCount":4}}`)
	if valid == nil || valid.ConversationID != "conversation-1" || valid.BatchIndex != 2 {
		t.Fatalf("valid client context was not decoded: %+v", valid)
	}
	if context := taskClientContext(`{"metadata":{"source":"other","conversationId":"conversation-1","messageId":"message-1"}}`); context != nil {
		t.Fatalf("unexpected context for non-create-page task: %+v", context)
	}
}

func TestTaskClientContextProjectsChapterOperations(t *testing.T) {
	assets := taskClientContext(`{"metadata":{"domainProjectId":"project-1","chapterId":"chapter-0","operation":"chapter_asset_breakdown"}}`)
	if assets == nil || assets.DomainProjectID != "project-1" || assets.ChapterID != "chapter-0" || assets.ChapterOperation != "assets" {
		t.Fatalf("asset task context was not decoded: %+v", assets)
	}
	characters := taskClientContext(`{"metadata":{"domainProjectId":"project-1","chapterId":"chapter-1","operation":"chapter_character_breakdown"}}`)
	if characters == nil || characters.DomainProjectID != "project-1" || characters.ChapterID != "chapter-1" || characters.ChapterOperation != "characters" {
		t.Fatalf("character task context was not decoded: %+v", characters)
	}
	storyboard := taskClientContext(`{"metadata":{"source":"short-drama-chapter-storyboard","domainProjectId":"project-1","chapterId":"chapter-2"}}`)
	if storyboard == nil || storyboard.ChapterID != "chapter-2" || storyboard.ChapterOperation != "storyboard" {
		t.Fatalf("storyboard task context was not decoded: %+v", storyboard)
	}
	if context := taskClientContext(`{"metadata":{"domainProjectId":"project-1","chapterId":"chapter-1","operation":"unrelated"}}`); context != nil {
		t.Fatalf("unexpected context for unrelated project task: %+v", context)
	}
}

func TestTaskClientContextProjectsShotWorkflow(t *testing.T) {
	context := taskClientContext(`{"metadata":{"domainProjectId":"project-1","shotId":"shot-1","workflowStepId":"step-1","artifactType":"video"}}`)
	if context == nil || context.DomainProjectID != "project-1" || context.ShotID != "shot-1" || context.WorkflowStepID != "step-1" || context.ArtifactType != "video" {
		t.Fatalf("shot task context was not decoded: %+v", context)
	}
}

func TestTaskOutputResourceReadsPersistedMedia(t *testing.T) {
	id, mediaType := taskOutputResource(`{"mode":"video","video":{"resourceId":"resource-1","storageKey":"resource:resource-1"}}`, "canvas_video")
	if id != "resource-1" || mediaType != "video" {
		t.Fatalf("unexpected task output resource: id=%q mediaType=%q", id, mediaType)
	}
}

func TestTaskSummariesForOutputUsesBillingAmountForCurrentStatus(t *testing.T) {
	tests := []struct {
		name   string
		order  model.BillingOrder
		amount int64
	}{
		{
			name: "settled uses actual amount",
			order: model.BillingOrder{
				Status:                     model.BillingStatusSettled,
				AmountMicrocredits:         640_585,
				ReservedAmountMicrocredits: 640_585,
				ActualAmountMicrocredits:   757_034,
			},
			amount: 757_034,
		},
		{
			name: "running uses reserved amount",
			order: model.BillingOrder{
				Status:                     model.BillingStatusRunning,
				AmountMicrocredits:         500_000,
				ReservedAmountMicrocredits: 640_585,
			},
			amount: 640_585,
		},
		{
			name: "refunded uses refunded amount",
			order: model.BillingOrder{
				Status:                     model.BillingStatusRefunded,
				AmountMicrocredits:         500_000,
				ReservedAmountMicrocredits: 640_585,
				RefundedAmountMicrocredits: 640_585,
			},
			amount: 640_585,
		},
		{
			name: "legacy reservation falls back to quoted amount",
			order: model.BillingOrder{
				Status:             model.BillingStatusReserved,
				AmountMicrocredits: 500_000,
			},
			amount: 500_000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			task := model.Task{ID: "task-1", BillingOrderID: "order-1"}
			summaries := taskSummariesForOutputWithBilling([]model.Task{task}, map[string]model.BillingOrder{"task-1": tt.order})
			if len(summaries) != 1 || summaries[0].Billing == nil {
				t.Fatalf("billing summary missing: %#v", summaries)
			}
			if got := summaries[0].Billing.AmountMicrocredits; got != tt.amount {
				t.Fatalf("billing amount = %d, want %d", got, tt.amount)
			}
			if got := summaries[0].Billing.Status; got != tt.order.Status {
				t.Fatalf("billing status = %q, want %q", got, tt.order.Status)
			}
		})
	}
}
