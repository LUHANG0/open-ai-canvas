package repository

import (
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func (r *Repository) CreateProjectDeliveryJob(job *model.ProjectDeliveryJob) (*model.ProjectDeliveryJob, bool, error) {
	var result model.ProjectDeliveryJob
	created := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		if job.ActiveKey != nil {
			existing := tx.Where("active_key = ?", *job.ActiveKey).First(&result)
			if existing.Error == nil {
				return nil
			}
			if existing.Error != nil && existing.Error != gorm.ErrRecordNotFound {
				return existing.Error
			}
		}
		inserted := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(job)
		if inserted.Error != nil {
			return inserted.Error
		}
		if inserted.RowsAffected == 1 {
			result = *job
			created = true
			return nil
		}
		if job.ActiveKey == nil {
			return gorm.ErrDuplicatedKey
		}
		return tx.Where("active_key = ?", *job.ActiveKey).First(&result).Error
	})
	if err != nil {
		return nil, false, err
	}
	return &result, created, nil
}

func (r *Repository) ProjectDeliveryJobForUser(userID string, projectID string, unitID string, id string) (*model.ProjectDeliveryJob, error) {
	var job model.ProjectDeliveryJob
	err := r.db.First(&job, "id = ? AND user_id = ? AND project_id = ? AND unit_id = ?", id, userID, projectID, unitID).Error
	return &job, err
}

func (r *Repository) LatestProjectDeliveryJob(userID string, projectID string, unitID string) (*model.ProjectDeliveryJob, error) {
	var job model.ProjectDeliveryJob
	result := r.db.Where("user_id = ? AND project_id = ? AND unit_id = ?", userID, projectID, unitID).
		Order("created_at desc").Limit(1).Find(&job)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &job, nil
}

func (r *Repository) ActiveProjectDeliveryJobCount(userID string, projectID string, unitID string) (int64, error) {
	query := r.db.Model(&model.ProjectDeliveryJob{}).
		Where("user_id = ? AND project_id = ? AND status IN ?", userID, projectID, []model.ProjectDeliveryJobStatus{model.ProjectDeliveryJobStatusQueued, model.ProjectDeliveryJobStatusRunning})
	if unitID != "" {
		query = query.Where("unit_id = ?", unitID)
	}
	var count int64
	err := query.Count(&count).Error
	return count, err
}

func (r *Repository) ClaimNextProjectDeliveryJob(owner string, leaseDuration time.Duration) (*model.ProjectDeliveryJob, error) {
	var job model.ProjectDeliveryJob
	now := time.Now()
	err := r.db.Transaction(func(tx *gorm.DB) error {
		available := "status = ? OR (status = ? AND (lease_expires_at IS NULL OR lease_expires_at <= ?))"
		query := tx.Where(available, model.ProjectDeliveryJobStatusQueued, model.ProjectDeliveryJobStatusRunning, now).
			Order("created_at asc").Limit(1)
		if r.Dialect() == "postgres" {
			query = query.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"})
		}
		result := query.Find(&job)
		if result.Error != nil || result.RowsAffected == 0 {
			return result.Error
		}
		claim := tx.Model(&model.ProjectDeliveryJob{}).Where("id = ?", job.ID)
		if r.Dialect() != "postgres" {
			claim = claim.Where(available, model.ProjectDeliveryJobStatusQueued, model.ProjectDeliveryJobStatusRunning, now)
		}
		updated := claim.Updates(map[string]any{
			"status":           model.ProjectDeliveryJobStatusRunning,
			"stage":            "准备服务器交付环境",
			"progress":         5,
			"lease_owner":      owner,
			"lease_expires_at": now.Add(leaseDuration),
			"updated_at":       now,
		})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected == 0 {
			job = model.ProjectDeliveryJob{}
			return nil
		}
		return tx.First(&job, "id = ?", job.ID).Error
	})
	if err != nil || job.ID == "" {
		return nil, err
	}
	return &job, nil
}

func (r *Repository) RenewProjectDeliveryJobLease(id string, owner string, leaseDuration time.Duration) error {
	result := r.db.Model(&model.ProjectDeliveryJob{}).
		Where("id = ? AND status = ? AND lease_owner = ?", id, model.ProjectDeliveryJobStatusRunning, owner).
		Updates(map[string]any{"lease_expires_at": time.Now().Add(leaseDuration), "updated_at": time.Now()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}

func (r *Repository) UpdateProjectDeliveryJobProgress(id string, owner string, stage string, progress int) error {
	result := r.db.Model(&model.ProjectDeliveryJob{}).
		Where("id = ? AND status = ? AND lease_owner = ?", id, model.ProjectDeliveryJobStatusRunning, owner).
		Updates(map[string]any{"stage": stage, "progress": progress, "updated_at": time.Now()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}

func (r *Repository) CompleteProjectDeliveryJob(id string, owner string, resourceID string, fileName string, expiresAt time.Time) error {
	now := time.Now()
	result := r.db.Model(&model.ProjectDeliveryJob{}).
		Where("id = ? AND status = ? AND lease_owner = ?", id, model.ProjectDeliveryJobStatusRunning, owner).
		Updates(map[string]any{
			"status": model.ProjectDeliveryJobStatusSucceeded, "stage": "交付包已就绪", "progress": 100,
			"resource_id": resourceID, "file_name": fileName, "error": "", "active_key": nil,
			"lease_owner": "", "lease_expires_at": nil, "expires_at": expiresAt, "completed_at": now, "updated_at": now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}

func (r *Repository) FailProjectDeliveryJob(id string, owner string, message string) error {
	now := time.Now()
	result := r.db.Model(&model.ProjectDeliveryJob{}).
		Where("id = ? AND status = ? AND lease_owner = ?", id, model.ProjectDeliveryJobStatusRunning, owner).
		Updates(map[string]any{
			"status": model.ProjectDeliveryJobStatusFailed, "stage": "交付包生成失败", "error": message,
			"active_key": nil, "lease_owner": "", "lease_expires_at": nil, "completed_at": now, "updated_at": now,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrTaskStateConflict
	}
	return nil
}

func (r *Repository) ExpiredProjectDeliveryJobs(now time.Time, limit int) ([]model.ProjectDeliveryJob, error) {
	if limit <= 0 || limit > 100 {
		limit = 25
	}
	var jobs []model.ProjectDeliveryJob
	err := r.db.Where("status = ? AND expires_at IS NOT NULL AND expires_at <= ? AND resource_id <> ''", model.ProjectDeliveryJobStatusSucceeded, now).
		Order("expires_at asc").Limit(limit).Find(&jobs).Error
	return jobs, err
}

func (r *Repository) ExpireProjectDeliveryJob(jobID string, resource *model.Resource, deletionJob *model.ResourceDeletionJob) (bool, error) {
	expired := false
	err := r.db.Transaction(func(tx *gorm.DB) error {
		var job model.ProjectDeliveryJob
		if err := tx.First(&job, "id = ? AND status = ?", jobID, model.ProjectDeliveryJobStatusSucceeded).Error; err != nil {
			if err == gorm.ErrRecordNotFound {
				return nil
			}
			return err
		}
		if resource != nil && deletionJob != nil && job.ResourceID == resource.ID {
			deleted := tx.Delete(&model.Resource{}, "id = ? AND user_id = ?", resource.ID, job.UserID)
			if deleted.Error != nil {
				return deleted.Error
			}
			if deleted.RowsAffected == 1 {
				if err := tx.Create(deletionJob).Error; err != nil {
					return err
				}
			}
		}
		now := time.Now()
		updated := tx.Model(&model.ProjectDeliveryJob{}).Where("id = ? AND status = ?", job.ID, model.ProjectDeliveryJobStatusSucceeded).
			Updates(map[string]any{"status": model.ProjectDeliveryJobStatusExpired, "stage": "交付包已过期", "resource_id": "", "updated_at": now})
		if updated.Error != nil {
			return updated.Error
		}
		expired = updated.RowsAffected == 1
		return nil
	})
	return expired, err
}
