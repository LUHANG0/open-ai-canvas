package repository

import "yingce/backend/internal/model"

// AdminModelHealthLogs reads a bounded, compact snapshot. Provider status is
// required to distinguish accepted asynchronous work from completed outcomes.
func (r *Repository) AdminModelHealthLogs(filter PublicModelAvailabilityFilter, limit int) ([]model.ApiCallLog, error) {
	logs := make([]model.ApiCallLog, 0)
	if len(filter.ChannelIDs) == 0 || !filter.To.After(filter.From) || limit <= 0 {
		return logs, nil
	}
	query := whereTimeRange(r.db.Select("channel_id", "model", "status", "provider_status", "status_code", "error_code", "duration_ms", "created_at", "request_kind"), "api_call_logs.created_at", filter.From, filter.To).
		Where("channel_id IN ?", filter.ChannelIDs).
		Where("model <> '' AND request_kind = ?", "create").
		Where("status IN ?", []model.ApiCallStatus{model.ApiCallStatusSucceeded, model.ApiCallStatusFailed}).
		Order("created_at desc, id desc").Limit(limit)
	return logs, query.Find(&logs).Error
}
