package repository

import (
	"gorm.io/gorm/clause"
	"time"
	"yingce/backend/internal/model"
)

// CompareAndSwapSystemSetting keeps a complete publication atomic across instances.
func (r *Repository) CompareAndSwapSystemSetting(next *model.SystemSetting, previous *model.SystemSetting) (bool, error) {
	if previous == nil {
		result := r.db.Clauses(clause.OnConflict{DoNothing: true}).Create(next)
		return result.RowsAffected == 1, result.Error
	}
	result := r.db.Model(&model.SystemSetting{}).Where("key = ? AND value_json = ?", next.Key, previous.ValueJSON).Updates(map[string]any{"value_json": next.ValueJSON, "updated_by": next.UpdatedBy, "updated_at": time.Now()})
	return result.RowsAffected == 1, result.Error
}
