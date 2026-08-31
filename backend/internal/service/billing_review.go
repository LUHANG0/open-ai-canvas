package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"
)

const (
	billingReviewStaleAfter = 15 * time.Minute
	billingReviewPageSize   = 200
	billingReviewMaxScan    = 1000
	billingReviewInterval   = 5 * time.Minute
)

type billingReviewRepository interface {
	StaleBillingReviewStats(now time.Time, age time.Duration) (repository.BillingReviewStats, error)
	StaleBillingReviewCandidates(now time.Time, age time.Duration, limit int, offset int) ([]repository.BillingReviewCandidate, error)
	SettleBillingOrder(orderID string, providerRequestID string) error
	RefundBillingOrder(orderID string, errorText string) error
	MarkBillingUncertain(orderID string, errorText string) error
}

type billingReviewRecoveryStats struct {
	Scanned  int
	Settled  int
	Refunded int
	Manual   int
	Failed   int
}

// AuditBillingReview 会对长期未闭合订单执行有界、保守的自动收口。
//
// 只有两类证据充分的情况会动资金：
//   - 任务成功，且 Token 订单已有上游 usage：幂等结算；
//   - 任务失败/取消，且有 request_not_sent 正向证据：幂等退款。
//
// 无任务、证据缺失、已发上游的失败以及超出补扣风控的订单继续保留冻结，进入人工核对。
func (s *Service) AuditBillingReview() error {
	now := time.Now()
	stale, err := s.repo.StaleBillingReviewStats(now, billingReviewStaleAfter)
	if err != nil {
		return err
	}
	startOffset := billingReviewStartOffset(now, stale.Total())
	recovery, recoveryErr := reconcileStaleBillingOrdersFromOffset(s.repo, now, billingReviewStaleAfter, billingReviewMaxScan, startOffset)
	oldest := ""
	if stale.Oldest != nil {
		oldest = stale.Oldest.UTC().Format(time.RFC3339)
	}
	// 即使本轮没有异常，只要扫描或收口了订单就输出结构化计数，
	// 运维可以直接对 failed/manual 持续增长设置日志告警。
	if stale.Total() > 0 || recovery.Scanned > 0 || recoveryErr != nil {
		log.Printf("billing recovery audit stale_orders=%d reserved=%d running=%d uncertain=%d scanned=%d auto_settled=%d auto_refunded=%d manual_review=%d failed=%d oldest=%s",
			stale.Total(), stale.Reserved, stale.Running, stale.Uncertain,
			recovery.Scanned, recovery.Settled, recovery.Refunded, recovery.Manual, recovery.Failed, oldest)
	}
	return recoveryErr
}

func reconcileStaleBillingOrders(repo billingReviewRepository, now time.Time, age time.Duration, limit int) (billingReviewRecoveryStats, error) {
	return reconcileStaleBillingOrdersFromOffset(repo, now, age, limit, 0)
}

func reconcileStaleBillingOrdersFromOffset(repo billingReviewRepository, now time.Time, age time.Duration, limit int, startOffset int) (billingReviewRecoveryStats, error) {
	stats := billingReviewRecoveryStats{}
	candidates, err := staleBillingCandidatesForRecovery(repo, now, age, limit, startOffset)
	if err != nil {
		return stats, err
	}
	stats.Scanned = len(candidates)
	var recoveryErr error
	for _, candidate := range candidates {
		action, reason := billingRecoveryDecision(candidate)
		switch action {
		case "settle":
			providerRequestID := firstNonEmpty(
				strings.TrimSpace(candidate.Order.ProviderRequestID),
				strings.TrimSpace(candidate.TaskProviderRequestID),
				strings.TrimSpace(candidate.LogProviderRequestID),
			)
			if err := repo.SettleBillingOrder(candidate.Order.ID, providerRequestID); err != nil {
				stats.Failed++
				reviewReason := truncateRunes("auto_recovery_settle_failed: "+err.Error(), 1000)
				markErr := repo.MarkBillingUncertain(candidate.Order.ID, reviewReason)
				if markErr != nil {
					err = errors.Join(err, fmt.Errorf("mark uncertain: %w", markErr))
				}
				log.Printf("billing recovery action failed order_id=%s task_id=%s action=settle reason=%q error=%v", candidate.Order.ID, candidate.Order.TaskID, reason, err)
				recoveryErr = errors.Join(recoveryErr, fmt.Errorf("billing order %s auto settle: %w", candidate.Order.ID, err))
				continue
			}
			stats.Settled++
			log.Printf("billing recovery action order_id=%s task_id=%s action=settle reason=%q", candidate.Order.ID, candidate.Order.TaskID, reason)
		case "refund":
			refundReason := "auto_recovery_refund: terminal task with request_not_sent evidence"
			if err := repo.RefundBillingOrder(candidate.Order.ID, refundReason); err != nil {
				stats.Failed++
				reviewReason := truncateRunes("auto_recovery_refund_failed: "+err.Error(), 1000)
				markErr := repo.MarkBillingUncertain(candidate.Order.ID, reviewReason)
				if markErr != nil {
					err = errors.Join(err, fmt.Errorf("mark uncertain: %w", markErr))
				}
				log.Printf("billing recovery action failed order_id=%s task_id=%s action=refund reason=%q error=%v", candidate.Order.ID, candidate.Order.TaskID, reason, err)
				recoveryErr = errors.Join(recoveryErr, fmt.Errorf("billing order %s auto refund: %w", candidate.Order.ID, err))
				continue
			}
			stats.Refunded++
			log.Printf("billing recovery action order_id=%s task_id=%s action=refund reason=%q", candidate.Order.ID, candidate.Order.TaskID, reason)
		default:
			stats.Manual++
		}
	}
	return stats, recoveryErr
}

// staleBillingCandidatesForRecovery 先分页只读收集候选，再由上层执行资金动作。
// 如果一边翻页一边结算/退款，订单移出 stale 集合会使 offset 漂移并跳过记录。
// startOffset 由时间片轮换，单轮即使被 limit 限制，后续页也不会长期被最旧的人工单饿死。
func staleBillingCandidatesForRecovery(repo billingReviewRepository, now time.Time, age time.Duration, limit int, startOffset int) ([]repository.BillingReviewCandidate, error) {
	if limit <= 0 {
		return []repository.BillingReviewCandidate{}, nil
	}
	if startOffset < 0 {
		startOffset = 0
	}
	items := make([]repository.BillingReviewCandidate, 0, min(limit, billingReviewPageSize))
	seen := make(map[string]struct{}, min(limit, billingReviewPageSize))
	offset := startOffset
	wrapped := startOffset == 0
	for len(items) < limit {
		if wrapped && startOffset > 0 && offset >= startOffset {
			break
		}
		pageLimit := min(billingReviewPageSize, limit-len(items))
		if wrapped && startOffset > 0 {
			pageLimit = min(pageLimit, startOffset-offset)
		}
		if pageLimit <= 0 {
			break
		}
		page, err := repo.StaleBillingReviewCandidates(now, age, pageLimit, offset)
		if err != nil {
			return nil, err
		}
		if len(page) == 0 {
			if !wrapped && startOffset > 0 {
				offset = 0
				wrapped = true
				continue
			}
			break
		}
		for _, candidate := range page {
			if _, exists := seen[candidate.Order.ID]; exists {
				continue
			}
			seen[candidate.Order.ID] = struct{}{}
			items = append(items, candidate)
			if len(items) == limit {
				break
			}
		}
		offset += len(page)
		if len(page) < pageLimit {
			if !wrapped && startOffset > 0 {
				offset = 0
				wrapped = true
				continue
			}
			break
		}
	}
	return items, nil
}

func billingReviewStartOffset(now time.Time, total int64) int {
	if total <= billingReviewPageSize {
		return 0
	}
	pageCount := (total + int64(billingReviewPageSize) - 1) / int64(billingReviewPageSize)
	timeSlot := now.Unix() / int64(billingReviewInterval/time.Second)
	return int(timeSlot%pageCount) * billingReviewPageSize
}

func billingRecoveryDecision(candidate repository.BillingReviewCandidate) (action string, reason string) {
	if !candidate.TaskFound {
		return "manual", "task_missing"
	}
	if currentOrderID := strings.TrimSpace(candidate.TaskBillingOrderID); currentOrderID != candidate.Order.ID {
		// RetryTaskWithBilling 会复用 Task 主键并把 billing_order_id 指向新订单。
		// 空 billing_order_id 也不能证明当前终态属于这笔旧单；旧订单不得
		// 根据“新一次执行”或无法归属的任务终态结算或退款。
		return "manual", "task_billing_order_mismatch"
	}
	switch candidate.TaskStatus {
	case model.TaskStatusSucceeded:
		if tokenBillingRequiresUsage(candidate.Order) && !candidate.UsageAvailable {
			return "manual", "successful_task_without_usage"
		}
		return "settle", "successful_task_with_settlement_evidence"
	case model.TaskStatusFailed, model.TaskStatusCancelled:
		if billingRequestNotSent(candidate) {
			return "refund", "terminal_task_request_not_sent"
		}
		return "manual", "terminal_task_upstream_cost_not_proven"
	default:
		return "manual", "task_not_terminal"
	}
}

func tokenBillingRequiresUsage(order model.BillingOrder) bool {
	return order.BillingMode == "token" && (order.InputTokenPriceMicrocredits != 0 || order.OutputTokenPriceMicrocredits != 0 || order.CachedTokenPriceMicrocredits != 0)
}

func billingRequestNotSent(candidate repository.BillingReviewCandidate) bool {
	if strings.TrimSpace(candidate.Order.ProviderRequestID) != "" ||
		strings.TrimSpace(candidate.TaskProviderRequestID) != "" ||
		strings.TrimSpace(candidate.LogProviderRequestID) != "" ||
		candidate.DispatchedBillableCallCount > 0 {
		return false
	}
	if candidate.Order.Status == model.BillingStatusReserved &&
		(candidate.TaskStage == "路由准备失败" || candidate.TaskStage == "计费准备失败") {
		// 这两个阶段由 worker 在 route execute 之前写入，是明确的未发请求证据。
		return true
	}
	if candidate.Order.Status == model.BillingStatusReserved && candidate.TaskStatus == model.TaskStatusCancelled && !candidate.TaskStarted {
		// 排队任务在领取前取消，started_at 仍为空；不把“仅仅仍是 reserved”
		// 当作证据，避免旧版本或日志缺失时误退已发上游的费用。
		return true
	}
	// running/uncertain 不能因为日志缺失就退款；必须存在渠道槽位失败这类
	// 在 HTTP 发送之前产生的明确证据。
	return candidate.PreDispatchFailureCount > 0 && candidate.BillableCallCount == candidate.PreDispatchFailureCount
}

func (s *Service) startBillingReviewAudit(ctx context.Context) {
	audit := func() {
		if err := s.AuditBillingReview(); err != nil {
			log.Printf("billing review audit failed: %v", err)
		}
	}
	s.runWorkerLoop(func(ctx context.Context) {
		audit()
		ticker := time.NewTicker(billingReviewInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				audit()
			}
		}
	})
}
