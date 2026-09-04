package repository

import (
	"errors"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

var ErrRegistrationInviteUnavailable = errors.New("registration invite unavailable")

func (r *Repository) CreateRegistrationInvite(invite *model.RegistrationInvite, audit *model.AdminAuditEvent) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(invite).Error; err != nil {
			return err
		}
		return tx.Create(audit).Error
	})
}

func (r *Repository) RegistrationInviteByTokenHash(tokenHash string) (*model.RegistrationInvite, error) {
	var invite model.RegistrationInvite
	if err := r.db.First(&invite, "token_hash = ?", tokenHash).Error; err != nil {
		return nil, err
	}
	return &invite, nil
}

func (r *Repository) RegistrationInvite(id string) (*model.RegistrationInvite, error) {
	var invite model.RegistrationInvite
	if err := r.db.Preload("UsedByUser").First(&invite, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &invite, nil
}

func (r *Repository) RegistrationInvites(status string, now time.Time, limit int, offset int) ([]model.RegistrationInvite, int64, error) {
	query := r.db.Model(&model.RegistrationInvite{})
	switch status {
	case "pending":
		query = query.Where("used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", now)
	case "used":
		query = query.Where("used_at IS NOT NULL")
	case "expired":
		query = query.Where("used_at IS NULL AND revoked_at IS NULL AND expires_at <= ?", now)
	case "revoked":
		query = query.Where("used_at IS NULL AND revoked_at IS NOT NULL")
	}
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var invites []model.RegistrationInvite
	if err := query.Preload("UsedByUser").Order("created_at DESC").Limit(limit).Offset(offset).Find(&invites).Error; err != nil {
		return nil, 0, err
	}
	return invites, total, nil
}

func (r *Repository) RevokeRegistrationInvite(id string, now time.Time, audit *model.AdminAuditEvent) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		updated := tx.Model(&model.RegistrationInvite{}).
			Where("id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", id, now).
			Updates(map[string]any{"revoked_at": now, "updated_at": now})
		if updated.Error != nil {
			return updated.Error
		}
		if updated.RowsAffected != 1 {
			return ErrRegistrationInviteUnavailable
		}
		return tx.Create(audit).Error
	})
}

// ConsumeRegistrationInvite atomically claims the one-time credential and
// creates every durable part of a successful signup. Any validation or insert
// failure rolls the claim back, so callers may safely let the user retry.
func (r *Repository) ConsumeRegistrationInvite(inviteID string, tokenHash string, now time.Time, user *model.User, session *model.AuthSession, signupBonus int64) error {
	return r.db.Transaction(func(tx *gorm.DB) error {
		// used_by is an immediate foreign key on both supported databases. Insert
		// the user first; a lost invite claim rolls this insert back with the rest
		// of the transaction.
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		claimed := tx.Model(&model.RegistrationInvite{}).
			Where("id = ? AND token_hash = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?", inviteID, tokenHash, now).
			Updates(map[string]any{"used_at": now, "used_by": user.ID, "updated_at": now})
		if claimed.Error != nil {
			return claimed.Error
		}
		if claimed.RowsAffected != 1 {
			return ErrRegistrationInviteUnavailable
		}
		if signupBonus > 0 {
			account := model.CreditAccount{UserID: user.ID, AvailableMicrocredits: signupBonus, Version: 1, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&account).Error; err != nil {
				return err
			}
			reference := "signup:" + user.ID
			entry := model.CreditLedgerEntry{
				ID:                         newRepositoryID(),
				UserID:                     user.ID,
				Type:                       model.CreditLedgerSignupBonus,
				AmountMicrocredits:         signupBonus,
				AvailableDeltaMicrocredits: signupBonus,
				AvailableAfterMicrocredits: signupBonus,
				ReferenceKey:               &reference,
				Note:                       "新用户默认积分",
				CreatedAt:                  now,
			}
			if err := tx.Create(&entry).Error; err != nil {
				return err
			}
		}
		return tx.Create(session).Error
	})
}
