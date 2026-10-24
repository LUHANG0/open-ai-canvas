package model

import "time"

// RegistrationInvitation snapshots the entire signup grant, including zero.
// Only a successful registration may set UsedByUserID; no role is configurable.
type RegistrationInvitation struct {
	ID                string     `json:"id" gorm:"primaryKey;size:36"`
	CodeHash          string     `json:"-" gorm:"size:64;not null;uniqueIndex"`
	CodeEncrypted     string     `json:"-" gorm:"type:text;not null"`
	CreatedByUserID   string     `json:"createdByUserId" gorm:"size:36;not null;index"`
	Note              string     `json:"note" gorm:"size:200"`
	BonusMicrocredits int64      `json:"bonusMicrocredits" gorm:"not null"`
	CreatedAt         time.Time  `json:"createdAt" gorm:"index"`
	ExpiresAt         time.Time  `json:"expiresAt" gorm:"not null;index"`
	RevokedAt         *time.Time `json:"revokedAt,omitempty"`
	UsedAt            *time.Time `json:"usedAt,omitempty"`
	UsedByUserID      *string    `json:"usedByUserId,omitempty" gorm:"size:36;uniqueIndex"`
}

func (i RegistrationInvitation) State(now time.Time) string {
	if i.UsedAt != nil {
		return "used"
	}
	if i.RevokedAt != nil {
		return "revoked"
	}
	if !i.ExpiresAt.After(now) {
		return "expired"
	}
	return "valid"
}
