package repository

import (
	"errors"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// SaveChannelModelConfiguration 将模型、价格档、历史快照和管理员审计放在同一事务。
// expectedPriceVersion 为空表示创建；更新必须命中客户端读到的版本，防止旧页面静默覆盖。
func (r *Repository) SaveChannelModelConfiguration(
	item *model.ChannelModel,
	tiers []model.ChannelModelPriceTier,
	expectedPriceVersion *int64,
	baseline *model.ChannelModelRevision,
	revision *model.ChannelModelRevision,
	audit *model.AdminAuditEvent,
) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if expectedPriceVersion == nil {
			if err := tx.Create(item).Error; err != nil {
				return err
			}
		} else {
			updated := tx.Model(&model.ChannelModel{}).
				Where("id = ? AND channel_id = ? AND price_version = ?", item.ID, item.ChannelID, *expectedPriceVersion).
				Select("*").
				Omit("id", "channel_id", "created_at", "deleted_at").
				Updates(item)
			if updated.Error != nil {
				return updated.Error
			}
			if updated.RowsAffected != 1 {
				return ErrChannelModelVersionConflict
			}
		}
		if err := saveChannelModelPriceTiers(tx, item.ID, tiers); err != nil {
			return err
		}
		if baseline != nil {
			if err := tx.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "channel_model_id"}, {Name: "version"}}, DoNothing: true}).Create(baseline).Error; err != nil {
				return err
			}
		}
		if revision != nil {
			if err := tx.Create(revision).Error; err != nil {
				return err
			}
		}
		if audit != nil {
			if err := tx.Create(audit).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

func (r *Repository) ChannelModelRevisions(channelModelID string, limit int) ([]model.ChannelModelRevision, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var revisions []model.ChannelModelRevision
	err := r.db.Where("channel_model_id = ?", channelModelID).Order("version desc").Limit(limit).Find(&revisions).Error
	return revisions, err
}

func (r *Repository) ChannelModelRevision(channelModelID string, revisionID string) (*model.ChannelModelRevision, error) {
	var revision model.ChannelModelRevision
	if err := r.db.First(&revision, "id = ? AND channel_model_id = ?", revisionID, channelModelID).Error; err != nil {
		return nil, err
	}
	return &revision, nil
}

func (r *Repository) HasChannelModelRevision(channelModelID string, version int64) (bool, error) {
	var count int64
	err := r.db.Model(&model.ChannelModelRevision{}).Where("channel_model_id = ? AND version = ?", channelModelID, version).Count(&count).Error
	return count > 0, err
}

func IsChannelModelVersionConflict(err error) bool {
	return errors.Is(err, ErrChannelModelVersionConflict)
}
