package repository

import (
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestStaleBillingReviewCandidatesCollectsTerminalAndUpstreamEvidence(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:billing-review-candidates?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.BillingOrder{}, &model.Task{}, &model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 9, 1, 12, 0, 0, 0, time.UTC)
	old := now.Add(-time.Hour)
	orders := []model.BillingOrder{
		{ID: "reserved-preparation", UserID: "user-1", IdempotencyKey: "order-1", TaskID: "task-1", Status: model.BillingStatusReserved, CreatedAt: old, UpdatedAt: old},
		{ID: "uncertain-html", UserID: "user-1", IdempotencyKey: "order-2", TaskID: "task-2", Status: model.BillingStatusUncertain, Error: "unexpected HTML response", CreatedAt: old, UpdatedAt: old},
		{ID: "running-slot", UserID: "user-1", IdempotencyKey: "order-3", TaskID: "task-3", Status: model.BillingStatusRunning, CreatedAt: old, UpdatedAt: old},
		{ID: "uncertain-success", UserID: "user-1", IdempotencyKey: "order-4", TaskID: "task-4", Status: model.BillingStatusUncertain, BillingMode: "token", OutputTokenPriceMicrocredits: 1, CreatedAt: old, UpdatedAt: old},
		{ID: "fresh", UserID: "user-1", IdempotencyKey: "order-5", TaskID: "task-5", Status: model.BillingStatusRunning, CreatedAt: now, UpdatedAt: now},
	}
	if err := db.Create(&orders).Error; err != nil {
		t.Fatal(err)
	}
	tasks := []model.Task{
		{ID: "task-1", Status: model.TaskStatusFailed, Stage: "路由准备失败", CreatedAt: old, UpdatedAt: old},
		{ID: "task-2", Status: model.TaskStatusFailed, Stage: "任务失败", Error: "non-json response", CreatedAt: old, UpdatedAt: old},
		{ID: "task-3", Status: model.TaskStatusFailed, Stage: "任务失败", CreatedAt: old, UpdatedAt: old},
		{ID: "task-4", Status: model.TaskStatusSucceeded, BillingOrderID: "uncertain-success", ProviderRequestID: "provider-task", CreatedAt: old, UpdatedAt: old},
		{ID: "task-5", Status: model.TaskStatusRunning, CreatedAt: now, UpdatedAt: now},
	}
	if err := db.Create(&tasks).Error; err != nil {
		t.Fatal(err)
	}
	logs := []model.ApiCallLog{
		{ID: "slot-log", BillingOrderID: "running-slot", Billable: true, Status: model.ApiCallStatusFailed, ErrorCode: "channel_concurrency_wait_timeout", CreatedAt: old},
		{ID: "usage-log", BillingOrderID: "uncertain-success", RequestKind: "poll", Status: model.ApiCallStatusSucceeded, UsageAvailable: true, OutputTokens: 123, ProviderRequestID: "provider-from-log", CreatedAt: old},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatal(err)
	}

	candidates, err := New(db).StaleBillingReviewCandidates(now, 15*time.Minute, 20, 0)
	if err != nil {
		t.Fatalf("StaleBillingReviewCandidates() error = %v", err)
	}
	if len(candidates) != 4 {
		t.Fatalf("candidate count = %d, want 4", len(candidates))
	}
	byID := make(map[string]BillingReviewCandidate, len(candidates))
	for _, candidate := range candidates {
		byID[candidate.Order.ID] = candidate
	}
	if candidate := byID["reserved-preparation"]; !candidate.TaskFound || candidate.TaskStatus != model.TaskStatusFailed || candidate.TaskStage != "路由准备失败" {
		t.Fatalf("reserved candidate = %#v", candidate)
	}
	if candidate := byID["uncertain-html"]; candidate.DispatchedBillableCallCount != 0 || candidate.PreDispatchFailureCount != 0 || candidate.UsageAvailable {
		t.Fatalf("HTML failure must not become request_not_sent evidence: %#v", candidate)
	}
	if candidate := byID["running-slot"]; candidate.BillableCallCount != 1 || candidate.DispatchedBillableCallCount != 0 || candidate.PreDispatchFailureCount != 1 {
		t.Fatalf("pre-dispatch candidate = %#v", candidate)
	}
	if candidate := byID["uncertain-success"]; !candidate.UsageAvailable || candidate.TaskBillingOrderID != "uncertain-success" || candidate.TaskProviderRequestID != "provider-task" || candidate.LogProviderRequestID != "provider-from-log" {
		t.Fatalf("successful usage candidate = %#v", candidate)
	}
}

func TestBillingPreDispatchErrorCodeIsAllowlistOnly(t *testing.T) {
	for _, code := range []string{"channel_concurrency_wait_timeout", "channel_concurrency_wait_cancelled", "channel_concurrency_unavailable"} {
		if !billingPreDispatchErrorCode(code) {
			t.Fatalf("billingPreDispatchErrorCode(%q) = false", code)
		}
	}
	for _, code := range []string{"", "upstream_timeout", "unexpected_html", "request_cancelled"} {
		if billingPreDispatchErrorCode(code) {
			t.Fatalf("billingPreDispatchErrorCode(%q) = true", code)
		}
	}
}
