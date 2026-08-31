package repository

import (
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
)

// BillingReviewStats 记录需要关注的长期未闭合订单数量。
type BillingReviewStats struct {
	Reserved  int64      `json:"reserved"`
	Running   int64      `json:"running"`
	Uncertain int64      `json:"uncertain"`
	Oldest    *time.Time `json:"oldest,omitempty"`
}

// BillingReviewCandidate 将未闭合订单与任务终态、上游调用证据组合在一起。
//
// 这里故意不根据“没查到日志”推断“一定没发上游”：日志写入本身可能失败。
// 只有 reserved 状态，或日志明确标记为获取渠道槽位失败，才能作为 request_not_sent 的正向证据。
type BillingReviewCandidate struct {
	Order                       model.BillingOrder
	TaskFound                   bool
	TaskStatus                  model.TaskStatus
	TaskStage                   string
	TaskStarted                 bool
	TaskBillingOrderID          string
	TaskProviderRequestID       string
	BillableCallCount           int64
	DispatchedBillableCallCount int64
	PreDispatchFailureCount     int64
	UsageAvailable              bool
	LogProviderRequestID        string
}

func (s BillingReviewStats) Total() int64 {
	return s.Reserved + s.Running + s.Uncertain
}

// StaleBillingReviewStats 查询超过 age 未更新、仍处于未闭合状态的订单。
func (r *Repository) StaleBillingReviewStats(now time.Time, age time.Duration) (BillingReviewStats, error) {
	cutoff := now.Add(-age)
	stats := BillingReviewStats{}
	var rows []struct {
		Status model.BillingStatus
		Count  int64
	}
	if err := r.db.Model(&model.BillingOrder{}).
		Select("status, count(*) AS count").
		Where("status IN ? AND updated_at < ?", []model.BillingStatus{
			model.BillingStatusReserved,
			model.BillingStatusRunning,
			model.BillingStatusUncertain,
		}, cutoff).
		Group("status").Scan(&rows).Error; err != nil {
		return stats, err
	}
	for _, row := range rows {
		switch row.Status {
		case model.BillingStatusReserved:
			stats.Reserved = row.Count
		case model.BillingStatusRunning:
			stats.Running = row.Count
		case model.BillingStatusUncertain:
			stats.Uncertain = row.Count
		}
	}
	if stats.Total() == 0 {
		return stats, nil
	}
	var oldest struct {
		CreatedAt time.Time
	}
	if err := r.db.Model(&model.BillingOrder{}).
		Select("created_at").
		Where("status IN ? AND updated_at < ?", []model.BillingStatus{
			model.BillingStatusReserved,
			model.BillingStatusRunning,
			model.BillingStatusUncertain,
		}, cutoff).
		Order("created_at asc").Limit(1).Scan(&oldest).Error; err != nil {
		return stats, err
	}
	stats.Oldest = &oldest.CreatedAt
	return stats, nil
}

// StaleBillingReviewCandidates 返回一个有界批次，供 service 根据证据执行幂等结算/退款。
// 不在 SQL 中直接修改资金，避免把终态判断和账户事务耦合成不可审计的批量 UPDATE。
func (r *Repository) StaleBillingReviewCandidates(now time.Time, age time.Duration, limit int, offset int) ([]BillingReviewCandidate, error) {
	if limit <= 0 {
		return []BillingReviewCandidate{}, nil
	}
	if offset < 0 {
		offset = 0
	}
	cutoff := now.Add(-age)
	var orders []model.BillingOrder
	if err := r.db.Where("status IN ? AND updated_at < ?", []model.BillingStatus{
		model.BillingStatusReserved,
		model.BillingStatusRunning,
		model.BillingStatusUncertain,
	}, cutoff).Order("updated_at asc, id asc").Limit(limit).Offset(offset).Find(&orders).Error; err != nil {
		return nil, err
	}
	candidates := make([]BillingReviewCandidate, len(orders))
	if len(orders) == 0 {
		return candidates, nil
	}

	orderIndex := make(map[string]int, len(orders))
	taskIDs := make([]string, 0, len(orders))
	orderIDs := make([]string, 0, len(orders))
	for index, order := range orders {
		candidates[index].Order = order
		orderIndex[order.ID] = index
		orderIDs = append(orderIDs, order.ID)
		if order.TaskID != "" {
			taskIDs = append(taskIDs, order.TaskID)
		}
	}

	if len(taskIDs) > 0 {
		var tasks []model.Task
		if err := r.db.Select("id", "status", "stage", "started_at", "billing_order_id", "provider_request_id").Where("id IN ?", taskIDs).Find(&tasks).Error; err != nil {
			return nil, err
		}
		taskByID := make(map[string]model.Task, len(tasks))
		for _, task := range tasks {
			taskByID[task.ID] = task
		}
		for index := range candidates {
			if task, ok := taskByID[candidates[index].Order.TaskID]; ok {
				candidates[index].TaskFound = true
				candidates[index].TaskStatus = task.Status
				candidates[index].TaskStage = strings.TrimSpace(task.Stage)
				candidates[index].TaskStarted = task.StartedAt != nil
				candidates[index].TaskBillingOrderID = strings.TrimSpace(task.BillingOrderID)
				candidates[index].TaskProviderRequestID = strings.TrimSpace(task.ProviderRequestID)
			}
		}
	}

	// 轮询日志可能很多，只读自动收口需要的证据行。
	var logs []model.ApiCallLog
	if err := r.db.Select("billing_order_id", "billable", "status", "usage_available", "error_code", "provider_request_id").
		Where("billing_order_id IN ? AND (billable = ? OR usage_available = ? OR provider_request_id <> ?)", orderIDs, true, true, "").
		Find(&logs).Error; err != nil {
		return nil, err
	}
	for _, call := range logs {
		index, ok := orderIndex[call.BillingOrderID]
		if !ok {
			continue
		}
		candidate := &candidates[index]
		if call.Billable {
			candidate.BillableCallCount++
			if billingPreDispatchErrorCode(call.ErrorCode) {
				candidate.PreDispatchFailureCount++
			} else {
				candidate.DispatchedBillableCallCount++
			}
		}
		if call.Status == model.ApiCallStatusSucceeded && call.UsageAvailable {
			candidate.UsageAvailable = true
		}
		if candidate.LogProviderRequestID == "" {
			candidate.LogProviderRequestID = strings.TrimSpace(call.ProviderRequestID)
		}
	}
	return candidates, nil
}

func billingPreDispatchErrorCode(code string) bool {
	switch strings.TrimSpace(code) {
	case "channel_concurrency_wait_timeout", "channel_concurrency_wait_cancelled", "channel_concurrency_unavailable":
		return true
	default:
		return false
	}
}
