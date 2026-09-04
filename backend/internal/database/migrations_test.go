package database

import (
	"errors"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

func TestMigrateSchemaRecordsAndValidatesVersion(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:migration-version?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	status, err := ReadSchemaStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("unexpected schema status: %#v", status)
	}
	if !db.Migrator().HasIndex(&schemaMigration{}, "idx_schema_migrations_applied_at") {
		t.Fatal("schema migration v2 did not create the applied_at index")
	}
	if !db.Migrator().HasTable(&model.ChannelModelRevision{}) {
		t.Fatal("schema migration v3 did not create channel model revisions")
	}
	for _, column := range []string{"price_entry_mode", "upstream_discount_basis_points", "discount_increment_basis_points"} {
		if !db.Migrator().HasColumn(&model.ChannelModel{}, column) {
			t.Fatalf("schema migration v3 did not create channel_models.%s", column)
		}
	}
	for _, column := range []string{"original_unit_price_microcredits", "original_input_token_price_microcredits", "original_output_token_price_microcredits", "original_cached_token_price_microcredits"} {
		if !db.Migrator().HasColumn(&model.ChannelModelPriceTier{}, column) {
			t.Fatalf("schema migration v3 did not create channel_model_price_tiers.%s", column)
		}
	}
	for _, column := range []string{"idempotency_key", "idempotency_fingerprint"} {
		if !db.Migrator().HasColumn(&model.Task{}, column) {
			t.Fatalf("schema migration v4 did not create tasks.%s", column)
		}
	}
	if !db.Migrator().HasIndex(&model.Task{}, "idx_tasks_user_idempotency") {
		t.Fatal("schema migration v4 did not create the task idempotency index")
	}
	if !db.Migrator().HasTable(&model.ProjectDeliveryJob{}) {
		t.Fatal("schema migration v5 did not create project delivery jobs")
	}
	if !db.Migrator().HasTable(&model.CreationConversation{}) {
		t.Fatal("schema migration v6 did not create creation conversations")
	}
	if !db.Migrator().HasTable(&model.RegistrationInvite{}) {
		t.Fatal("schema migration v7 did not create registration invites")
	}
	if !db.Migrator().HasColumn(&model.RegistrationInvite{}, "credit_amount_microcredits") {
		t.Fatal("schema migration v8 did not create registration_invites.credit_amount_microcredits")
	}
	for _, index := range []string{"idx_registration_invites_token_hash", "idx_registration_invites_state"} {
		if !db.Migrator().HasIndex(&model.RegistrationInvite{}, index) {
			t.Fatalf("schema migration v7 did not create %s", index)
		}
	}
	for _, index := range []string{"idx_project_delivery_claim", "idx_project_delivery_scope_created", "idx_project_delivery_jobs_active_key"} {
		if !db.Migrator().HasIndex(&model.ProjectDeliveryJob{}, index) {
			t.Fatalf("schema migration v5 did not create %s", index)
		}
	}
	// 旧任务不回填伪键；可空列必须允许同一用户有多条历史数据。
	for _, task := range []model.Task{{ID: "legacy-task-1", UserID: "legacy-user"}, {ID: "legacy-task-2", UserID: "legacy-user"}} {
		if err := db.Create(&task).Error; err != nil {
			t.Fatalf("nullable idempotency key rejected legacy task: %v", err)
		}
	}
	key := "migration-idempotency-key-0001"
	if err := db.Create(&model.Task{ID: "keyed-task-1", UserID: "keyed-user", IdempotencyKey: &key}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Task{ID: "keyed-task-2", UserID: "keyed-user", IdempotencyKey: &key}).Error; err == nil {
		t.Fatal("task idempotency unique index accepted a duplicate user/key pair")
	}
	if err := db.Create(&model.Task{ID: "keyed-task-other-user", UserID: "other-user", IdempotencyKey: &key}).Error; err != nil {
		t.Fatalf("task idempotency key leaked across users: %v", err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatalf("migration should be idempotent: %v", err)
	}
}

func TestMigrateSchemaUpgradesV4DatabaseWithProjectDeliveryJobs(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:migration-project-delivery?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropTable(&model.ProjectDeliveryJob{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropTable(&model.CreationConversation{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Delete(&schemaMigration{}, "version >= ?", 5).Error; err != nil {
		t.Fatal(err)
	}
	status, err := ReadSchemaStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if status.Current != 4 || status.Ready {
		t.Fatalf("pre-upgrade schema status = %#v", status)
	}

	if err := MigrateSchema(db); err != nil {
		t.Fatalf("upgrade v4 database: %v", err)
	}
	if !db.Migrator().HasTable(&model.ProjectDeliveryJob{}) {
		t.Fatal("v5 upgrade did not create project delivery jobs")
	}
	if !db.Migrator().HasIndex(&model.ProjectDeliveryJob{}, "idx_project_delivery_jobs_active_key") {
		t.Fatal("v5 upgrade did not create the active-job uniqueness index")
	}
	status, err = ReadSchemaStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("post-upgrade schema status = %#v", status)
	}
	if !db.Migrator().HasTable(&model.CreationConversation{}) {
		t.Fatal("v6 upgrade did not create creation conversations")
	}
	if !db.Migrator().HasTable(&model.RegistrationInvite{}) {
		t.Fatal("v7 upgrade did not create registration invites")
	}
	if !db.Migrator().HasColumn(&model.RegistrationInvite{}, "credit_amount_microcredits") {
		t.Fatal("v8 upgrade did not create registration invite credits")
	}
}

func TestMigrateSchemaV8BackfillsExistingInviteCredits(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:migration-invite-credits?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	admin := model.User{ID: "migration-admin", Username: "migration-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&admin).Error; err != nil {
		t.Fatal(err)
	}
	invite := model.RegistrationInvite{ID: "legacy-invite", TokenHash: strings.Repeat("a", 64), CreatedBy: admin.ID, ExpiresAt: now.Add(time.Hour), CreatedAt: now, UpdatedAt: now}
	if err := db.Create(&invite).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("UPDATE registration_invites SET credit_amount_microcredits = 0 WHERE id = ?", invite.ID).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Delete(&schemaMigration{}, "version = ?", 8).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatalf("upgrade schema 7 invite credits: %v", err)
	}
	if err := db.First(&invite, "id = ?", invite.ID).Error; err != nil {
		t.Fatal(err)
	}
	if invite.CreditAmountMicrocredits != 100_000_000 {
		t.Fatalf("legacy invite credits=%d, want 100000000", invite.CreditAmountMicrocredits)
	}
}

func TestMigrateSchemaRejectsChecksumMismatch(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:migration-checksum?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&schemaMigration{}).Where("version = ?", CurrentSchemaVersion).Update("checksum", "changed").Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err == nil || !strings.Contains(err.Error(), "校验和不一致") {
		t.Fatalf("expected checksum mismatch, got %v", err)
	}
	if err := RequireSchemaVersion(db); err == nil || !strings.Contains(err.Error(), "校验和不一致") {
		t.Fatalf("schema verification must reject checksum mismatch, got %v", err)
	}
}

func TestMigrateSchemaRollsBackFailedMigration(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:migration-rollback?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}

	original := schemaMigrations
	schemaMigrations = append(append([]migration(nil), original...), migration{
		version:  CurrentSchemaVersion + 1,
		name:     "rollback_probe",
		checksum: "sha256:rollback-probe",
		apply: func(tx *gorm.DB) error {
			if err := tx.Exec("CREATE TABLE migration_rollback_probe (id INTEGER PRIMARY KEY)").Error; err != nil {
				return err
			}
			return errors.New("forced migration failure")
		},
	})
	t.Cleanup(func() { schemaMigrations = original })

	if err := MigrateSchema(db); err == nil || !strings.Contains(err.Error(), "forced migration failure") {
		t.Fatalf("expected forced migration failure, got %v", err)
	}
	if db.Migrator().HasTable("migration_rollback_probe") {
		t.Fatal("failed migration left a partial table behind")
	}
	var count int64
	if err := db.Model(&schemaMigration{}).Where("version = ?", CurrentSchemaVersion+1).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("failed migration was recorded: %d", count)
	}
}

func TestRequireSchemaVersionRejectsUninitializedDatabase(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:migration-uninitialized?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := RequireSchemaVersion(db); err == nil || !strings.Contains(err.Error(), "请先执行 migrate-schema up") {
		t.Fatalf("expected missing migration error, got %v", err)
	}
}
