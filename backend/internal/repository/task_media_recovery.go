package repository

import (
	"time"

	"yingce/backend/internal/model"
)

// Keyset pagination covers every recoverable checkpoint without an age cutoff.
// Only checkpoint identity columns are read; no generation or billing is run.
func (r *Repository) TasksWithPendingMediaCheckpoint(afterID string, limit int) ([]model.Task, error) {
	if limit <= 0 || limit > 1000 {
		limit = 500
	}
	query := r.db.Select("id", "user_id", "media_recovery_json").
		Where("COALESCE(media_recovery_json, '') <> '' AND status IN ?", []model.TaskStatus{model.TaskStatusQueued, model.TaskStatusRunning, model.TaskStatusFailed})
	if afterID != "" {
		query = query.Where("id > ?", afterID)
	}
	var tasks []model.Task
	err := query.Order("id ASC").Limit(limit).Find(&tasks).Error
	return tasks, err
}

// The existing task lease fences every checkpoint write, including after cancellation.
func (r *Repository) SaveTaskMediaCheckpoint(task *model.Task, encrypted, stage string) error {
	result := taskLeaseWriter(r.db.Model(&model.Task{}), task.LeaseOwner).
		Where("id = ? AND user_id = ? AND status = ? AND route_run = ?", task.ID, task.UserID, model.TaskStatusRunning, task.RouteRun).
		Updates(map[string]any{"media_recovery_json": encrypted, "media_stage": stage, "stage": "作品已生成，正在保存", "updated_at": time.Now()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	task.MediaRecoveryJSON, task.MediaStage = encrypted, stage
	return nil
}

// Manual recovery requeues the same task and order, never a new generation.
func (r *Repository) RequeueTaskMediaRecovery(task *model.Task, encrypted string) error {
	now := time.Now()
	result := r.db.Model(&model.Task{}).
		Where("id = ? AND user_id = ? AND status = ? AND media_recovery_json = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?)", task.ID, task.UserID, model.TaskStatusFailed, task.MediaRecoveryJSON, now).
		Updates(map[string]any{"status": model.TaskStatusQueued, "stage": "等待恢复作品保存", "error": "", "completed_at": nil, "next_poll_at": nil, "lease_owner": "", "lease_expires_at": nil, "media_recovery_json": encrypted, "updated_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}
