package database

import (
	"path/filepath"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func TestInvitationMigrationIsAdditiveAndIdempotent(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "invitations.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	pool, _ := db.DB()
	t.Cleanup(func() { _ = pool.Close() })
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	user := model.User{ID: "historical-user", Username: "historical-user", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(&user).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditAccount{UserID: user.ID, AvailableMicrocredits: 123456789}).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := migrateRegistrationInvitations(db); err != nil {
			t.Fatal(err)
		}
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", user.ID).Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 123456789 {
		t.Fatal("migration changed existing balance")
	}
	for _, entity := range []any{&model.CreationConversation{}, &model.CreationConversationMessage{}, &model.CreationConversationResource{}} {
		if !db.Migrator().HasTable(entity) {
			t.Fatalf("migration lost history model %T", entity)
		}
	}
	item := model.RegistrationInvitation{ID: "first", CodeHash: "same-hash", CodeEncrypted: "ciphertext", CreatedByUserID: "admin", ExpiresAt: time.Now().Add(time.Hour)}
	if err := db.Create(&item).Error; err != nil {
		t.Fatal(err)
	}
	copy := item
	copy.ID = "second"
	if err := db.Create(&copy).Error; err == nil {
		t.Fatal("short-code hash uniqueness missing")
	}
}
