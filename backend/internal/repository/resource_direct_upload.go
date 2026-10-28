package repository

import (
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"strings"
	"yingce/backend/internal/model"
)

// Retiring an expired grant keeps its bytes in the durable deletion outbox and
// frees the logical identity for a new object; it never reuses an old write grant.
func (r *Repository) RetireDirectUpload(before *model.Resource, job *model.ResourceDeletionJob) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockUploadStorage(tx, before.UserID); err != nil {
			return err
		}
		var current model.Resource
		query := tx.Where("id = ? AND user_id = ?", before.ID, before.UserID)
		if r.Dialect() == "postgres" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.First(&current).Error; err != nil {
			return err
		}
		if current.Status != model.ResourceStatusPending || !strings.HasPrefix(current.Error, "direct-upload:") || current.Error != before.Error || !current.UpdatedAt.Equal(before.UpdatedAt) {
			return ErrResourceCleanupSetChanged
		}
		if err := New(tx).ReleaseUploadSession(before.UserID, before.ID); err != nil {
			return err
		}
		if err := tx.Create(job).Error; err != nil {
			return err
		}
		return tx.Delete(&current).Error
	})
}

// CompleteDirectUpload atomically consumes quota and publishes exactly the row
// inspected by the service; a concurrent cleanup cannot resurrect that row.
func (r *Repository) CompleteDirectUpload(before, ready *model.Resource, limit, dailyLimit int64) (*model.Resource, bool, error) {
	var saved model.Resource
	changed := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if err := lockUploadStorage(tx, before.UserID); err != nil {
			return err
		}
		query := tx.Where("id = ? AND user_id = ?", before.ID, before.UserID)
		if r.Dialect() == "postgres" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE"})
		}
		if err := query.First(&saved).Error; err != nil {
			return err
		}
		if saved.Status == model.ResourceStatusReady {
			return nil
		}
		if saved.Status != model.ResourceStatusPending || saved.Error != before.Error || saved.ObjectKey != before.ObjectKey || !saved.UpdatedAt.Equal(before.UpdatedAt) {
			return ErrResourceCleanupSetChanged
		}
		if err := New(tx).SaveResourceWithinStorageLimit(ready, limit, dailyLimit, before.ID); err != nil {
			return err
		}
		saved, changed = *ready, true
		return nil
	})
	return &saved, changed, err
}
