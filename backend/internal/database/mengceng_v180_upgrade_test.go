package database

import (
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// These are the identities already published by MengCeng. Upstream uses the
// same numbers for different tables; importing its registry must not relabel
// or overwrite any of these receipts.
func TestMengCengV180RetainsPublishedMigrationIdentities(t *testing.T) {
	want := map[int64][2]string{
		60: {"creation_conversation_history", "sha256:creation-conversation-history-v60"},
		61: {"registration_invitations", "sha256:registration-invitations-v61"},
		62: {"task_submission_receipts", "sha256:task-submission-receipts-v62-20261101"},
		63: {"user_feedbacks", "sha256:user-feedbacks-v60-20261020"},
		64: {"drama_production", "sha256:drama-production-v61-20261024"},
		65: {"drama_shot_segments", "sha256:drama-shot-segments-v62-20261024"},
		90: {"inspiration_feed", "sha256:inspiration-feed-v87-20261105"},
	}
	for _, step := range schemaMigrations {
		if identity, ok := want[step.version]; ok {
			if step.name != identity[0] || step.checksum != identity[1] {
				t.Fatalf("migration %d identity changed: %s / %s", step.version, step.name, step.checksum)
			}
			delete(want, step.version)
		}
	}
	if len(want) != 0 {
		t.Fatalf("missing migration identities: %v", want)
	}
}

func mengcengUpgradeDatabases(t *testing.T, run func(*testing.T, *gorm.DB)) {
	t.Helper()
	t.Run("sqlite", func(t *testing.T) {
		db, err := Open(Config{Driver: "sqlite", DSN: filepath.Join(t.TempDir(), "upgrade.db")})
		if err != nil {
			t.Fatal(err)
		}
		sqlDB, err := db.DB()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = sqlDB.Close() })
		run(t, db)
	})
	t.Run("postgres", func(t *testing.T) {
		dsn := strings.TrimSpace(os.Getenv("CANVAS_TEST_POSTGRES_DSN"))
		if dsn == "" {
			t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
		}
		base, err := Open(Config{Driver: "postgres", DSN: dsn})
		if err != nil {
			t.Fatal(err)
		}
		sqlBase, err := base.DB()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = sqlBase.Close() })
		schema := fmt.Sprintf("mengceng_upgrade_%d", time.Now().UnixNano())
		if err := base.Exec(`CREATE SCHEMA "` + schema + `"`).Error; err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := base.Exec(`DROP SCHEMA "` + schema + `" CASCADE`).Error; err != nil {
				t.Error(err)
			}
		})
		testDSN, err := postgresDSNWithSearchPath(dsn, schema)
		if err != nil {
			t.Fatal(err)
		}
		db, err := Open(Config{Driver: "postgres", DSN: testDSN})
		if err != nil {
			t.Fatal(err)
		}
		sqlDB, err := db.DB()
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = sqlDB.Close() })
		run(t, db)
	})
}

// This unit fixture fixes the published ledger boundary, using current model
// definitions. A separate acceptance run must also upgrade a database created
// by the frozen 77d1d621 source, to detect omitted column migrations.
func seedMengCengSchema62(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.AutoMigrate(&schemaMigration{}); err != nil {
		t.Fatal(err)
	}
	for _, step := range schemaMigrations {
		if step.version > 62 {
			break
		}
		if err := step.apply(db); err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&schemaMigration{Version: step.version, Name: step.name, Checksum: step.checksum, AppliedAt: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	for _, value := range mengcengPreservedRows() {
		if err := db.Create(value).Error; err != nil {
			t.Fatalf("seed %T: %v", value, err)
		}
	}
}

func mengcengPreservedRows() []any {
	return []any{
		&model.User{ID: "legacy-owner", Username: "legacy-owner", Email: "owner@example.invalid", PasswordHash: "synthetic-password-hash", Role: model.UserRoleUser, Status: model.UserStatusActive},
		&model.CreditAccount{UserID: "legacy-owner", AvailableMicrocredits: 123456789, ReservedMicrocredits: 321, Version: 17},
		&model.RegistrationInvitation{ID: "legacy-invite", CodeHash: "synthetic-code-hash", CodeEncrypted: "synthetic-cipher", CreatedByUserID: "legacy-owner", BonusMicrocredits: 456789, ExpiresAt: time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC)},
		&model.CreationConversation{UserID: "legacy-owner", ID: "legacy-conversation", Title: "Saved conversation", Revision: 9, MetadataRevision: 3},
		&model.CreationConversationMessage{UserID: "legacy-owner", ConversationID: "legacy-conversation", ID: "legacy-message", Revision: 4, Sequence: 7, PayloadJSON: `{"role":"user","content":"keep my history"}`},
		&model.CreationConversationResource{UserID: "legacy-owner", ConversationID: "legacy-conversation", MessageID: "legacy-message", ResourceID: "legacy-resource"},
		&model.Task{ID: "legacy-task", UserID: "legacy-owner", Status: model.TaskStatusSucceeded, Prompt: "Saved generation prompt"},
		&model.TaskSubmission{UserID: "legacy-owner", Key: "legacy-intent-000001", PayloadHash: "synthetic-hash", TaskID: "legacy-task"},
		&model.Resource{ID: "legacy-resource", UserID: "legacy-owner", Kind: "image", ObjectKey: "synthetic/keep.png", Size: 1234},
		&model.CanvasProject{ID: "legacy-canvas", UserID: "legacy-owner", Title: "Saved canvas", PayloadJSON: `{"nodes":[{"id":"kept-node"}],"connections":[]}`, Revision: 13},
		&model.SystemSetting{Key: "brand_site", ValueJSON: `{"brand":"MengCeng","revision":7}`},
		&model.UserOSSSetting{ID: "legacy-oss", UserID: "legacy-owner", Enabled: true, ValueJSON: `{"encrypted":"synthetic-storage-config"}`},
		&model.ModelChannel{ID: "legacy-channel", UserID: "legacy-owner", Scope: model.ChannelScopeUser, Enabled: true, Name: "Private channel", BaseURL: "https://example.invalid", APIKey: "synthetic-private-key"},
		&model.ChannelModel{ID: "legacy-model", ChannelID: "legacy-channel", ModelKey: "custom-model", DisplayName: "Custom price", BillingMode: "per_call", UnitPriceMicrocredits: 876543, InputTokenPriceMicrocredits: 2345, OutputTokenPriceMicrocredits: 3456, CachedTokenPriceMicrocredits: 456, PriceConfigured: true, Enabled: true, PriceVersion: 42},
		&model.ChannelModelPriceTier{ID: "legacy-tier", ChannelModelID: "legacy-model", SelectorKey: `{"resolution":"1080p"}`, SelectorJSON: `{"resolution":"1080p"}`, Resolution: "1080p", BillingMode: "per_call", UnitPriceMicrocredits: 987654, PriceConfigured: true, Enabled: true, PriceVersion: 43, CostPricing: model.CreditCostPricing{Configured: true, UnitPriceMicrocredits: 400001}},
		&model.PaymentOrder{ID: "legacy-payment", UserID: "legacy-owner", IdempotencyKey: "legacy-payment-key", MerchantOrderNo: "synthetic-merchant-order", AmountFen: 1234, Currency: "CNY", CreditsMicrocredits: 7654321, Status: model.PaymentOrderCredited},
		&model.BillingOrder{ID: "legacy-bill", UserID: "legacy-owner", IdempotencyKey: "legacy-bill-key", AmountMicrocredits: 123456, ReservedAmountMicrocredits: 123456, ActualAmountMicrocredits: 100000, RefundedAmountMicrocredits: 23456, ChargeLimitSet: true, ChargeLimitMicrocredits: 123456},
	}
}

func snapshotMengcengRows(t *testing.T, db *gorm.DB) []any {
	t.Helper()
	rows := mengcengPreservedRows()
	for _, row := range rows {
		// Every fixture model has its actual (including composite) primary key.
		query := db
		switch row.(type) {
		case *model.ChannelModel:
			// Only frozen columns participate in preservation comparisons;
			// new currency and token-rule defaults are intentional additions.
			query = db.Select("id", "channel_id", "model_key", "display_name", "billing_mode", "unit_price_microcredits", "input_token_price_microcredits", "output_token_price_microcredits", "cached_token_price_microcredits", "price_configured", "enabled", "price_version")
		case *model.ChannelModelPriceTier:
			query = db.Select("id", "channel_model_id", "selector_key", "selector_json", "resolution", "billing_mode", "unit_price_microcredits", "price_configured", "enabled", "price_version", "cost_configured", "cost_unit_price_microcredits")
		case *model.PaymentOrder:
			query = db.Select("id", "user_id", "idempotency_key", "merchant_order_no", "amount_fen", "currency", "credits_microcredits", "status")
		}
		if err := query.First(row).Error; err != nil {
			t.Fatalf("read %T: %v", row, err)
		}
	}
	return rows
}

func TestMengCengV180UpgradePreservesForkDataAndLedger(t *testing.T) {
	mengcengUpgradeDatabases(t, func(t *testing.T, db *gorm.DB) {
		seedMengCengSchema62(t, db)
		before := snapshotMengcengRows(t, db)
		var ledgerBefore []schemaMigration
		if err := db.Order("version").Find(&ledgerBefore).Error; err != nil {
			t.Fatal(err)
		}
		for range 2 {
			if err := MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		if after := snapshotMengcengRows(t, db); !reflect.DeepEqual(before, after) {
			t.Fatal("existing account, wallet, invitation, history, receipt, canvas, media, brand or billing row changed")
		}
		var ledgerAfter []schemaMigration
		if err := db.Where("version <= ?", 62).Order("version").Find(&ledgerAfter).Error; err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(ledgerBefore, ledgerAfter) {
			t.Fatal("published migration ledger was rewritten")
		}
		for _, table := range []any{&model.UserFeedback{}, &model.DramaProduction{}, &model.PoseLibraryItem{}, &model.ArkPortraitGroupGrant{}, &model.InspirationFeedEntry{}} {
			if !db.Migrator().HasTable(table) {
				t.Fatalf("missing upstream table %T", table)
			}
		}
		if err := db.Create(&model.TaskSubmission{UserID: "legacy-owner", Key: "legacy-intent-000001", PayloadHash: "different", TaskID: "duplicate-task"}).Error; err == nil {
			t.Fatal("upgrade lost task submission uniqueness")
		}
		if err := RequireSchemaVersion(db); err != nil {
			t.Fatal(err)
		}
	})
}

func TestMengCengV180RejectsOfficialAndDamagedLedgers(t *testing.T) {
	for _, scenario := range []string{"official", "checksum"} {
		t.Run(scenario, func(t *testing.T) {
			mengcengUpgradeDatabases(t, func(t *testing.T, db *gorm.DB) {
				seedMengCengSchema62(t, db)
				update := map[string]any{"checksum": "damaged"}
				if scenario == "official" {
					update = map[string]any{"name": "user_feedbacks", "checksum": "sha256:user-feedbacks-v60-20261020"}
				}
				if err := db.Model(&schemaMigration{}).Where("version = ?", 60).Updates(update).Error; err != nil {
					t.Fatal(err)
				}
				before := snapshotMengcengRows(t, db)
				if err := MigrateSchema(db); err == nil {
					t.Fatal("unrecognized migration lineage accepted")
				}
				var added int64
				if err := db.Model(&schemaMigration{}).Where("version > ?", 62).Count(&added).Error; err != nil || added != 0 {
					t.Fatalf("failed migration left new receipts: %d / %v", added, err)
				}
				if !reflect.DeepEqual(before, snapshotMengcengRows(t, db)) {
					t.Fatal("rejected migration changed user data")
				}
			})
		})
	}
}

func TestMengCengV180FailureRollsBackUpgrade(t *testing.T) {
	mengcengUpgradeDatabases(t, func(t *testing.T, db *gorm.DB) {
		seedMengCengSchema62(t, db)
		before := snapshotMengcengRows(t, db)
		if err := db.Migrator().DropTable(&model.InspirationFeedEntry{}); err != nil {
			t.Fatal(err)
		}
		var statements []string
		if db.Dialector.Name() == "postgres" {
			statements = []string{
				`CREATE FUNCTION reject_upgrade_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version = 90 THEN RAISE EXCEPTION 'injected upgrade interruption'; END IF; RETURN NEW; END $$`,
				`CREATE TRIGGER reject_upgrade_receipt BEFORE INSERT ON schema_migrations FOR EACH ROW EXECUTE FUNCTION reject_upgrade_receipt()`,
			}
		} else {
			statements = []string{`CREATE TRIGGER reject_upgrade_receipt BEFORE INSERT ON schema_migrations WHEN NEW.version = 90 BEGIN SELECT RAISE(ABORT, 'injected upgrade interruption'); END`}
		}
		for _, statement := range statements {
			if err := db.Exec(statement).Error; err != nil {
				t.Fatal(err)
			}
		}
		if err := MigrateSchema(db); err == nil || !strings.Contains(err.Error(), "injected upgrade interruption") {
			t.Fatalf("expected injected failure: %v", err)
		}
		status, err := ReadSchemaStatus(db)
		if err != nil || status.Current != 62 || status.Ready {
			t.Fatalf("failed upgrade schema: %+v / %v", status, err)
		}
		if db.Migrator().HasTable(&model.InspirationFeedEntry{}) {
			t.Fatal("failed upgrade left new DDL committed")
		}
		if !reflect.DeepEqual(before, snapshotMengcengRows(t, db)) {
			t.Fatal("failed upgrade changed existing data")
		}
	})
}

func TestMengCengV180FrozenSchema62Acceptance(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			var config Config
			if driver == "sqlite" {
				fixture := os.Getenv("MENGCENG_SCHEMA62_SQLITE_FIXTURE")
				if fixture == "" {
					t.Skip("frozen 77d1d621 SQLite fixture is not configured")
				}
				data, err := os.ReadFile(fixture)
				if err != nil {
					t.Fatal(err)
				}
				path := filepath.Join(t.TempDir(), "schema62.db")
				if err := os.WriteFile(path, data, 0o600); err != nil {
					t.Fatal(err)
				}
				config = Config{Driver: driver, DSN: path}
			} else {
				dsn := os.Getenv("MENGCENG_SCHEMA62_POSTGRES_FIXTURE_DSN")
				if dsn == "" {
					t.Skip("frozen 77d1d621 PostgreSQL fixture is not configured")
				}
				config = Config{Driver: driver, DSN: dsn}
			}
			db, err := Open(config)
			if err != nil {
				t.Fatal(err)
			}
			sqlDB, err := db.DB()
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = sqlDB.Close() })
			status, err := ReadSchemaStatus(db)
			if err != nil || status.Current != 62 || status.Ready {
				t.Fatalf("fixture must be an unmigrated MengCeng schema 62: %+v / %v", status, err)
			}
			var ledgerBefore []schemaMigration
			if err := db.Order("version").Find(&ledgerBefore).Error; err != nil {
				t.Fatal(err)
			}
			before := snapshotMengcengRows(t, db)
			for range 2 {
				if err := MigrateSchema(db); err != nil {
					t.Fatal(err)
				}
			}
			// Managed deployment starts a new runtime after migration. Reopen
			// the pool so pre-DDL SELECT * plans cannot mask data verification
			// with PostgreSQL's cached-plan result-type error.
			if err := sqlDB.Close(); err != nil {
				t.Fatal(err)
			}
			db, err = Open(config)
			if err != nil {
				t.Fatal(err)
			}
			runtimeSQLDB, err := db.DB()
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() { _ = runtimeSQLDB.Close() })
			if !reflect.DeepEqual(before, snapshotMengcengRows(t, db)) {
				t.Fatal("frozen legacy data was not preserved")
			}
			var ledgerAfter []schemaMigration
			if err := db.Where("version <= ?", 62).Order("version").Find(&ledgerAfter).Error; err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(ledgerBefore, ledgerAfter) {
				t.Fatal("frozen legacy migration receipts changed")
			}
			// Parse every registered model and check its persisted columns. A
			// successful ledger alone does not prove a true old schema is usable.
			for _, entity := range Models() {
				stmt := &gorm.Statement{DB: db}
				if err := stmt.Parse(entity); err != nil {
					t.Fatal(err)
				}
				if !db.Migrator().HasTable(entity) {
					t.Errorf("missing table %s", stmt.Schema.Table)
					continue
				}
				for _, column := range stmt.Schema.DBNames {
					if stmt.Schema.FieldsByDBName[column].IgnoreMigration {
						continue
					}
					if !db.Migrator().HasColumn(entity, column) {
						t.Errorf("missing upgraded column %s.%s", stmt.Schema.Table, column)
					}
				}
			}
			if err := RequireSchemaVersion(db); err != nil {
				t.Fatal(err)
			}
		})
	}
}
