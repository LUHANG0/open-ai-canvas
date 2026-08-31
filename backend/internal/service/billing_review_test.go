package service

import (
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

type billingReviewRepositoryStub struct {
	stats           repository.BillingReviewStats
	candidates      []repository.BillingReviewCandidate
	listErr         error
	settleErr       map[string]error
	refundErr       map[string]error
	settled         []string
	refunded        []string
	markedUncertain []string
}

func (r *billingReviewRepositoryStub) StaleBillingReviewStats(time.Time, time.Duration) (repository.BillingReviewStats, error) {
	return r.stats, nil
}

func (r *billingReviewRepositoryStub) StaleBillingReviewCandidates(_ time.Time, _ time.Duration, limit int, offset int) ([]repository.BillingReviewCandidate, error) {
	if r.listErr != nil {
		return nil, r.listErr
	}
	if offset >= len(r.candidates) || limit <= 0 {
		return []repository.BillingReviewCandidate{}, nil
	}
	end := min(offset+limit, len(r.candidates))
	return r.candidates[offset:end], nil
}

func (r *billingReviewRepositoryStub) SettleBillingOrder(orderID string, providerRequestID string) error {
	r.settled = append(r.settled, orderID+":"+providerRequestID)
	return r.settleErr[orderID]
}

func (r *billingReviewRepositoryStub) RefundBillingOrder(orderID string, reason string) error {
	r.refunded = append(r.refunded, orderID+":"+reason)
	return r.refundErr[orderID]
}

func (r *billingReviewRepositoryStub) MarkBillingUncertain(orderID string, reason string) error {
	r.markedUncertain = append(r.markedUncertain, orderID+":"+reason)
	return nil
}

func TestBillingRecoveryDecisionIsEvidenceBounded(t *testing.T) {
	tests := []struct {
		name      string
		candidate repository.BillingReviewCandidate
		action    string
	}{
		{
			name: "successful token task with usage settles",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{BillingMode: "token", OutputTokenPriceMicrocredits: 1},
				TaskFound: true, TaskStatus: model.TaskStatusSucceeded, UsageAvailable: true},
			action: "settle",
		},
		{
			name: "successful token task without usage stays manual",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{BillingMode: "token", OutputTokenPriceMicrocredits: 1},
				TaskFound: true, TaskStatus: model.TaskStatusSucceeded},
			action: "manual",
		},
		{
			name: "fixed price success does not require usage",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{BillingMode: "per_request"},
				TaskFound: true, TaskStatus: model.TaskStatusSucceeded},
			action: "settle",
		},
		{
			name: "generic reserved failure is not proof request was not sent",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusReserved},
				TaskFound: true, TaskStatus: model.TaskStatusFailed, TaskStage: "任务失败"},
			action: "manual",
		},
		{
			name: "preparation failure refunds",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusReserved},
				TaskFound: true, TaskStatus: model.TaskStatusFailed, TaskStage: "计费准备失败"},
			action: "refund",
		},
		{
			name: "queued cancellation refunds",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusReserved},
				TaskFound: true, TaskStatus: model.TaskStatusCancelled, TaskStarted: false},
			action: "refund",
		},
		{
			name: "started cancellation stays manual",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusReserved},
				TaskFound: true, TaskStatus: model.TaskStatusCancelled, TaskStarted: true},
			action: "manual",
		},
		{
			name: "uncertain HTML failure without positive evidence stays manual",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusUncertain, Error: "unexpected HTML"},
				TaskFound: true, TaskStatus: model.TaskStatusFailed},
			action: "manual",
		},
		{
			name: "allowlisted pre-dispatch failure refunds",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusUncertain},
				TaskFound: true, TaskStatus: model.TaskStatusFailed, BillableCallCount: 1, PreDispatchFailureCount: 1},
			action: "refund",
		},
		{
			name: "mixed dispatch evidence stays manual",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusUncertain},
				TaskFound: true, TaskStatus: model.TaskStatusFailed, BillableCallCount: 2, PreDispatchFailureCount: 1, DispatchedBillableCallCount: 1},
			action: "manual",
		},
		{
			name: "provider request id blocks refund",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{Status: model.BillingStatusReserved, ProviderRequestID: "provider-1"},
				TaskFound: true, TaskStatus: model.TaskStatusFailed, TaskStage: "路由准备失败"},
			action: "manual",
		},
		{
			name: "task now points at a newer billing order",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{ID: "old-order", Status: model.BillingStatusRunning, BillingMode: "fixed_request"},
				TaskFound: true, TaskStatus: model.TaskStatusSucceeded, TaskBillingOrderID: "new-order"},
			action: "manual",
		},
		{
			name: "task has no attributable billing order",
			candidate: repository.BillingReviewCandidate{Order: model.BillingOrder{ID: "old-order", Status: model.BillingStatusRunning, BillingMode: "fixed_request"},
				TaskFound: true, TaskStatus: model.TaskStatusSucceeded},
			action: "manual",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			action, _ := billingRecoveryDecision(tt.candidate)
			if action != tt.action {
				t.Fatalf("billingRecoveryDecision() action = %q, want %q", action, tt.action)
			}
		})
	}
}

func TestReconcileStaleBillingOrdersNeverSettlesReassignedFixedPriceOrders(t *testing.T) {
	repo := &billingReviewRepositoryStub{
		settleErr: map[string]error{}, refundErr: map[string]error{},
		candidates: []repository.BillingReviewCandidate{
			{Order: model.BillingOrder{ID: "old-reserved", TaskID: "task-1", Status: model.BillingStatusReserved, BillingMode: "fixed_request", AmountMicrocredits: 100}, TaskFound: true, TaskStatus: model.TaskStatusSucceeded, TaskBillingOrderID: "new-order"},
			{Order: model.BillingOrder{ID: "old-running", TaskID: "task-1", Status: model.BillingStatusRunning, BillingMode: "fixed_request", AmountMicrocredits: 100}, TaskFound: true, TaskStatus: model.TaskStatusSucceeded, TaskBillingOrderID: "new-order"},
		},
	}
	stats, err := reconcileStaleBillingOrders(repo, time.Now(), time.Minute, 20)
	if err != nil {
		t.Fatalf("reconcileStaleBillingOrders() error = %v", err)
	}
	if stats.Scanned != 2 || stats.Manual != 2 || stats.Settled != 0 || stats.Refunded != 0 || len(repo.settled) != 0 || len(repo.refunded) != 0 {
		t.Fatalf("reassigned orders were not isolated: stats=%#v settled=%#v refunded=%#v", stats, repo.settled, repo.refunded)
	}
}

func TestReconcileStaleBillingOrdersPagesPastTwoHundredManualOrders(t *testing.T) {
	candidates := make([]repository.BillingReviewCandidate, 0, 206)
	for index := 0; index < 205; index++ {
		orderID := fmt.Sprintf("manual-%03d", index)
		candidates = append(candidates, repository.BillingReviewCandidate{
			Order:     model.BillingOrder{ID: orderID, TaskID: fmt.Sprintf("task-%03d", index), Status: model.BillingStatusUncertain},
			TaskFound: true, TaskStatus: model.TaskStatusFailed, TaskBillingOrderID: orderID,
		})
	}
	candidates = append(candidates, repository.BillingReviewCandidate{
		Order:     model.BillingOrder{ID: "recoverable-after-manual", TaskID: "task-success", Status: model.BillingStatusRunning, BillingMode: "fixed_request", AmountMicrocredits: 100},
		TaskFound: true, TaskStatus: model.TaskStatusSucceeded, TaskBillingOrderID: "recoverable-after-manual",
	})
	repo := &billingReviewRepositoryStub{candidates: candidates, settleErr: map[string]error{}, refundErr: map[string]error{}}

	stats, err := reconcileStaleBillingOrders(repo, time.Now(), time.Minute, 400)
	if err != nil {
		t.Fatalf("reconcileStaleBillingOrders() error = %v", err)
	}
	if stats.Scanned != 206 || stats.Manual != 205 || stats.Settled != 1 || len(repo.settled) != 1 || !strings.HasPrefix(repo.settled[0], "recoverable-after-manual:") {
		t.Fatalf("paged recovery starved later order: stats=%#v settled=%#v", stats, repo.settled)
	}
}

func TestBillingReviewStartOffsetRotatesAcrossStalePages(t *testing.T) {
	intervalSeconds := int64(billingReviewInterval / time.Second)
	if got := billingReviewStartOffset(time.Unix(intervalSeconds*3, 0), 1201); got != 600 {
		t.Fatalf("billingReviewStartOffset() = %d, want 600", got)
	}
	if got := billingReviewStartOffset(time.Unix(intervalSeconds*7, 0), 1201); got != 0 {
		t.Fatalf("wrapped billingReviewStartOffset() = %d, want 0", got)
	}
}

func TestReconcileStaleBillingOrdersSettlesRefundsAndMarksFailuresForReview(t *testing.T) {
	repo := &billingReviewRepositoryStub{
		settleErr: map[string]error{"settle-fails": repository.ErrBillingSupplementBalance},
		refundErr: map[string]error{},
		candidates: []repository.BillingReviewCandidate{
			{Order: model.BillingOrder{ID: "settle-ok", TaskID: "task-1", BillingMode: "token", OutputTokenPriceMicrocredits: 1}, TaskFound: true, TaskStatus: model.TaskStatusSucceeded, TaskBillingOrderID: "settle-ok", UsageAvailable: true, TaskProviderRequestID: "provider-1"},
			{Order: model.BillingOrder{ID: "refund-ok", TaskID: "task-2", Status: model.BillingStatusReserved}, TaskFound: true, TaskStatus: model.TaskStatusFailed, TaskBillingOrderID: "refund-ok", TaskStage: "路由准备失败"},
			{Order: model.BillingOrder{ID: "manual", TaskID: "task-3", Status: model.BillingStatusUncertain}, TaskFound: true, TaskStatus: model.TaskStatusFailed, TaskBillingOrderID: "manual"},
			{Order: model.BillingOrder{ID: "settle-fails", TaskID: "task-4", BillingMode: "token", OutputTokenPriceMicrocredits: 1}, TaskFound: true, TaskStatus: model.TaskStatusSucceeded, TaskBillingOrderID: "settle-fails", UsageAvailable: true},
		},
	}

	stats, err := reconcileStaleBillingOrders(repo, time.Now(), time.Minute, 20)
	if err == nil || !strings.Contains(err.Error(), "settle-fails") {
		t.Fatalf("reconcileStaleBillingOrders() error = %v", err)
	}
	if stats.Scanned != 4 || stats.Settled != 1 || stats.Refunded != 1 || stats.Manual != 1 || stats.Failed != 1 {
		t.Fatalf("recovery stats = %#v", stats)
	}
	if len(repo.settled) != 2 || repo.settled[0] != "settle-ok:provider-1" {
		t.Fatalf("settled calls = %#v", repo.settled)
	}
	if len(repo.refunded) != 1 || !strings.HasPrefix(repo.refunded[0], "refund-ok:auto_recovery_refund") {
		t.Fatalf("refunded calls = %#v", repo.refunded)
	}
	if len(repo.markedUncertain) != 1 || !strings.Contains(repo.markedUncertain[0], "auto_recovery_settle_failed") {
		t.Fatalf("uncertain calls = %#v", repo.markedUncertain)
	}
}

func TestReconcileStaleBillingOrdersReturnsCandidateLookupFailure(t *testing.T) {
	repo := &billingReviewRepositoryStub{listErr: errors.New("database unavailable")}
	stats, err := reconcileStaleBillingOrders(repo, time.Now(), time.Minute, 20)
	if err == nil || stats.Scanned != 0 {
		t.Fatalf("reconcileStaleBillingOrders() = %#v, %v", stats, err)
	}
}
