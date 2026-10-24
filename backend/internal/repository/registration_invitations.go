package repository

import (
	"errors"
	"time"

	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

var ErrInvitationUnavailable = errors.New("邀请不可用，请重新验证邀请")
var ErrInvitationCollision = errors.New("邀请短码冲突")

func (r *Repository) RegistrationInvitationByHash(hash string) (*model.RegistrationInvitation, error) {
	var item model.RegistrationInvitation
	err := r.db.Where("code_hash = ?", hash).First(&item).Error
	return &item, err
}

func (r *Repository) RegistrationInvitations(limit, offset int) ([]model.RegistrationInvitation, int64, error) {
	var items []model.RegistrationInvitation
	var total int64
	if err := r.db.Model(&model.RegistrationInvitation{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := r.db.Order("created_at desc, id desc").Limit(limit).Offset(offset).Find(&items).Error
	return items, total, err
}

func (r *Repository) CreateRegistrationInvitation(item *model.RegistrationInvitation, audit *model.AdminAuditEvent) error {
	return r.Transaction(func(tx *Repository) error {
		result := tx.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "code_hash"}}, DoNothing: true}).Create(item)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvitationCollision
		}
		return tx.db.Create(audit).Error
	})
}

func (r *Repository) RevokeRegistrationInvitation(id string, now time.Time, audit *model.AdminAuditEvent) error {
	return r.Transaction(func(tx *Repository) error {
		result := tx.db.Model(&model.RegistrationInvitation{}).
			Where("id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", id, now).
			Update("revoked_at", now)
		if result.Error != nil {
			return result.Error
		}
		if result.RowsAffected != 1 {
			return ErrInvitationUnavailable
		}
		return tx.db.Create(audit).Error
	})
}

// Called within registration's transaction, after contact verification. The
// conditional update serializes consumers across instances and races with revoke.
func (r *Repository) ConsumeRegistrationInvitation(item *model.RegistrationInvitation, userID string, now time.Time) error {
	result := r.db.Model(&model.RegistrationInvitation{}).
		Where("id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", item.ID, now).
		Updates(map[string]any{"used_at": now, "used_by_user_id": userID})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected != 1 {
		return ErrInvitationUnavailable
	}
	// The existing signup reference also reserves zero, preventing later login
	// recovery from applying the global signup policy to an invited account.
	_, _, err := r.GrantCreditsOnce(userID, model.CreditLedgerSignupBonus, item.BonusMicrocredits, "signup:"+userID, "邀请注册赠送；邀请 "+item.ID)
	if err != nil {
		return err
	}
	if err := r.db.Model(&model.CreditLedgerEntry{}).Where("reference_key = ?", "signup:"+userID).
		Updates(map[string]any{"actor_user_id": item.CreatedByUserID, "scene": "registration_invitation"}).Error; err != nil {
		return err
	}
	return r.db.Create(&model.AdminAuditEvent{
		ID: newRepositoryID(), ActorUserID: item.CreatedByUserID,
		Action: "registration_invitation.consume", TargetType: "registration_invitation", TargetID: item.ID,
		Summary: "受邀用户注册成功", MetadataJSON: `{"userId":"` + userID + `"}`, CreatedAt: now,
	}).Error
}
