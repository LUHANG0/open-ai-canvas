package database

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

func TestPostgresAssetIDMigration(t *testing.T) {
	db := openPostgresMigrationTestDB(t, "asset_id_migration")

	for _, statement := range []string{
		`CREATE TABLE assets (id varchar(36) PRIMARY KEY)`,
		`CREATE TABLE project_asset_links (id varchar(36) PRIMARY KEY, asset_id varchar(36))`,
		`CREATE TABLE project_asset_candidates (id varchar(36) PRIMARY KEY, resolved_asset_id varchar(36))`,
		`CREATE TABLE asset_versions (id varchar(36) PRIMARY KEY, asset_id varchar(36))`,
	} {
		if err := db.Exec(statement).Error; err != nil {
			t.Fatalf("create legacy table: %v", err)
		}
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatalf("migrate schema: %v", err)
	}

	for _, migration := range assetIDColumnMigrations {
		var length int64
		if err := db.Raw(
			"SELECT character_maximum_length FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?",
			migration.table,
			migration.column,
		).Scan(&length).Error; err != nil {
			t.Fatalf("read migrated column %s.%s: %v", migration.table, migration.column, err)
		}
		if length != model.AssetIDMaxLength {
			t.Fatalf("%s.%s length = %d, want %d", migration.table, migration.column, length, model.AssetIDMaxLength)
		}
	}

	assetID := "generation_" + strings.Repeat("a", 64)
	if err := db.Create(&model.Asset{ID: assetID, UserID: "user-1", Kind: "image"}).Error; err != nil {
		t.Fatalf("insert deterministic generation asset: %v", err)
	}
	if err := db.Create(&model.ProjectAssetLink{ID: "link-1", ProjectID: "project-1", AssetID: assetID}).Error; err != nil {
		t.Fatalf("insert project asset link: %v", err)
	}
	if err := db.Create(&model.ProjectAssetCandidate{ID: "candidate-1", ProjectID: "project-1", ResolvedAssetID: assetID}).Error; err != nil {
		t.Fatalf("insert project asset candidate: %v", err)
	}
	if err := db.Create(&model.AssetVersion{ID: "version-1", AssetID: assetID, Version: 1}).Error; err != nil {
		t.Fatalf("insert asset version: %v", err)
	}
}

func TestPostgresProjectDeliveryMigrationUpgradesV4(t *testing.T) {
	db := openPostgresMigrationTestDB(t, "project_delivery_migration")
	if err := db.AutoMigrate(&schemaMigration{}); err != nil {
		t.Fatal(err)
	}
	for _, item := range schemaMigrations[:4] {
		record := schemaMigration{Version: item.version, Name: item.name, Checksum: item.checksum, AppliedAt: time.Now().UTC()}
		if err := db.Create(&record).Error; err != nil {
			t.Fatal(err)
		}
	}
	if db.Migrator().HasTable(&model.ProjectDeliveryJob{}) {
		t.Fatal("v4 fixture unexpectedly contains project delivery jobs")
	}

	if err := MigrateSchema(db); err != nil {
		t.Fatalf("upgrade postgres v4 database: %v", err)
	}
	if !db.Migrator().HasTable(&model.ProjectDeliveryJob{}) {
		t.Fatal("v5 upgrade did not create postgres project delivery jobs")
	}
	for _, index := range []string{"idx_project_delivery_claim", "idx_project_delivery_scope_created", "idx_project_delivery_jobs_active_key"} {
		if !db.Migrator().HasIndex(&model.ProjectDeliveryJob{}, index) {
			t.Fatalf("v5 postgres upgrade did not create %s", index)
		}
	}
	status, err := ReadSchemaStatus(db)
	if err != nil {
		t.Fatal(err)
	}
	if !status.Ready || status.Current != CurrentSchemaVersion {
		t.Fatalf("post-upgrade postgres schema status = %#v", status)
	}
	if !db.Migrator().HasTable(&model.RegistrationInvite{}) {
		t.Fatal("v7 upgrade did not create postgres registration invites")
	}
	if !db.Migrator().HasColumn(&model.RegistrationInvite{}, "credit_amount_microcredits") {
		t.Fatal("v8 upgrade did not create postgres registration invite credits")
	}
	for _, index := range []string{"idx_registration_invites_token_hash", "idx_registration_invites_state"} {
		if !db.Migrator().HasIndex(&model.RegistrationInvite{}, index) {
			t.Fatalf("v7 postgres upgrade did not create %s", index)
		}
	}
}

func openPostgresMigrationTestDB(t *testing.T, prefix string) *gorm.DB {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("CANVAS_TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}
	base, err := Open(Config{Driver: "postgres", DSN: dsn})
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	baseSQL, err := base.DB()
	if err != nil {
		t.Fatalf("postgres sql db: %v", err)
	}
	schemaName := fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	if err := base.Exec(`CREATE SCHEMA "` + schemaName + `"`).Error; err != nil {
		_ = baseSQL.Close()
		t.Fatalf("create test schema: %v", err)
	}
	testDSN, err := postgresDSNWithSearchPath(dsn, schemaName)
	if err != nil {
		_ = base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error
		_ = baseSQL.Close()
		t.Fatalf("test postgres dsn: %v", err)
	}
	db, err := Open(Config{Driver: "postgres", DSN: testDSN})
	if err != nil {
		_ = base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error
		_ = baseSQL.Close()
		t.Fatalf("open test schema: %v", err)
	}
	dbSQL, err := db.DB()
	if err != nil {
		_ = base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error
		_ = baseSQL.Close()
		t.Fatalf("test schema sql db: %v", err)
	}
	t.Cleanup(func() {
		_ = dbSQL.Close()
		if err := base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error; err != nil {
			t.Errorf("drop test schema: %v", err)
		}
		_ = baseSQL.Close()
	})
	return db
}

func postgresDSNWithSearchPath(dsn string, schemaName string) (string, error) {
	parsed, err := url.Parse(dsn)
	if err != nil {
		return "", err
	}
	query := parsed.Query()
	query.Set("search_path", schemaName)
	parsed.RawQuery = query.Encode()
	return parsed.String(), nil
}
