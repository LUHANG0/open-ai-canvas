package repository

import (
	"errors"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

var ErrCreationConversationConflict = errors.New("creation conversation revision conflict")

func (r *Repository) CreationConversations(userID string) ([]model.CreationConversation, error) {
	var conversations []model.CreationConversation
	err := r.db.Where("user_id = ?", userID).Order("updated_at desc, id asc").Find(&conversations).Error
	return conversations, err
}

func (r *Repository) CreationConversationForUser(userID string, id string) (*model.CreationConversation, error) {
	var conversation model.CreationConversation
	if err := r.db.First(&conversation, "id = ? AND user_id = ?", id, userID).Error; err != nil {
		return nil, err
	}
	return &conversation, nil
}

func (r *Repository) UpsertCreationConversation(conversation *model.CreationConversation, expectedRevision int64) error {
	if expectedRevision == 0 {
		conversation.Revision = 1
		if err := r.db.Create(conversation).Error; err != nil {
			var existing model.CreationConversation
			if lookupErr := r.db.Unscoped().First(&existing, "id = ?", conversation.ID).Error; lookupErr == nil {
				return ErrCreationConversationConflict
			}
			return err
		}
		return nil
	}
	updatedAt := time.Now().UTC()
	result := r.db.Model(&model.CreationConversation{}).
		Where("id = ? AND user_id = ? AND revision = ? AND deleted_at IS NULL", conversation.ID, conversation.UserID, expectedRevision).
		Updates(map[string]any{
			"title":        conversation.Title,
			"payload_json": conversation.PayloadJSON,
			"revision":     gorm.Expr("revision + 1"),
			"updated_at":   updatedAt,
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrCreationConversationConflict
	}
	conversation.Revision = expectedRevision + 1
	conversation.UpdatedAt = updatedAt
	return nil
}

func (r *Repository) DeleteCreationConversation(userID string, id string, expectedRevision int64) error {
	now := time.Now().UTC()
	result := r.db.Model(&model.CreationConversation{}).
		Where("id = ? AND user_id = ? AND revision = ? AND deleted_at IS NULL", id, userID, expectedRevision).
		Updates(map[string]any{"revision": gorm.Expr("revision + 1"), "updated_at": now, "deleted_at": now})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 1 {
		return nil
	}
	var existing model.CreationConversation
	if err := r.db.Unscoped().First(&existing, "id = ? AND user_id = ?", id, userID).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return nil
	} else if err != nil {
		return err
	}
	if existing.DeletedAt.Valid {
		return nil
	}
	return ErrCreationConversationConflict
}
