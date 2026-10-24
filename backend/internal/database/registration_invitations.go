package database

import (
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func migrateRegistrationInvitations(db *gorm.DB) error {
	return db.AutoMigrate(&model.RegistrationInvitation{})
}
