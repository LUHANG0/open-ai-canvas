package repository

import (
	"gorm.io/gorm/clause"
	"time"
	"yingce/backend/internal/model"
)

// CompareAndSwapEmailTemplates prevents one administrator from overwriting
// another administrator's changes, including the first save on either database.
func (r *Repository) CompareAndSwapEmailTemplates(next *model.SystemSetting, previous *model.SystemSetting) (bool, error) {
	if previous == nil {
		result := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(next)
		return result.RowsAffected == 1, result.Error
	}
	next.CreatedAt = previous.CreatedAt
	next.UpdatedAt = time.Now()
	result := r.db.Model(&model.SystemSetting{}).Where("key = ? AND value_json = ?", next.Key, previous.ValueJSON).
		Updates(map[string]any{"value_json": next.ValueJSON, "updated_by": next.UpdatedBy, "updated_at": next.UpdatedAt})
	return result.RowsAffected == 1, result.Error
}
