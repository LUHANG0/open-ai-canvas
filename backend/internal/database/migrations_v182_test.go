package database

import (
	"errors"
	"gorm.io/gorm"
	"reflect"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func schema92Fixture(t *testing.T, db *gorm.DB) []schemaMigration {
	t.Helper()
	if err := db.AutoMigrate(&schemaMigration{}); err != nil {
		t.Fatal(err)
	}
	for _, m := range schemaMigrations {
		if m.version > 92 {
			break
		}
		if err := m.apply(db); err != nil {
			t.Fatal(err)
		}
		if err := db.Create(&schemaMigration{Version: m.version, Name: m.name, Checksum: m.checksum, AppliedAt: time.Date(2026, 11, 6, 0, 0, 0, 0, time.UTC)}).Error; err != nil {
			t.Fatal(err)
		}
	}
	// The baseline schema builder uses current models. Remove new structures so
	// this exercises the actual old-schema path, rather than an empty no-op.
	if db.Migrator().HasColumn(&model.DramaProduction{}, "DraftJSON") {
		if err := db.Migrator().DropColumn(&model.DramaProduction{}, "DraftJSON"); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Migrator().DropTable(&model.EmailLog{}, &model.UserNotificationSetting{}); err != nil {
		t.Fatal(err)
	}
	var receipts []schemaMigration
	if err := db.Order("version").Find(&receipts).Error; err != nil {
		t.Fatal(err)
	}
	return receipts
}

func TestV182UpgradeKeepsForkReceiptsAndReferencePrices(t *testing.T) {
	mengcengUpgradeDatabases(t, testV182UpgradeKeepsForkReceiptsAndReferencePrices)
}

func testV182UpgradeKeepsForkReceiptsAndReferencePrices(t *testing.T, db *gorm.DB) {
	before := schema92Fixture(t, db)
	if err := db.Exec(`INSERT INTO channel_model_price_tiers (id,channel_model_id,selector_key,unit_price_microcredits,reference_video_unit_price_microcredits,cost_reference_video_unit_price_microcredits) VALUES ('keep-price','keep-model','{}',1500000,2500000,750000)`).Error; err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
	}
	var after []schemaMigration
	if err := db.Where("version <= ?", 92).Order("version").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) {
		t.Fatal("historical fork migration receipts changed")
	}
	var price struct{ UnitPriceMicrocredits, ReferenceVideoUnitPriceMicrocredits, CostReferenceVideoUnitPriceMicrocredits int64 }
	if err := db.Table("channel_model_price_tiers").Where("id = ?", "keep-price").Scan(&price).Error; err != nil {
		t.Fatal(err)
	}
	if price.UnitPriceMicrocredits != 1500000 || price.ReferenceVideoUnitPriceMicrocredits != 2500000 || price.CostReferenceVideoUnitPriceMicrocredits != 750000 {
		t.Fatalf("prices changed: %+v", price)
	}
	if !db.Migrator().HasColumn(&model.DramaProduction{}, "DraftJSON") || !db.Migrator().HasTable(&model.EmailLog{}) || !db.Migrator().HasTable(&model.UserNotificationSetting{}) {
		t.Fatal("new schema incomplete")
	}
	if err := RequireSchemaVersion(db); err != nil {
		t.Fatal(err)
	}
}

func TestV182UpgradeFailureRollsBackBothMigrations(t *testing.T) {
	mengcengUpgradeDatabases(t, testV182UpgradeFailureRollsBackBothMigrations)
}

func testV182UpgradeFailureRollsBackBothMigrations(t *testing.T, db *gorm.DB) {
	before := schema92Fixture(t, db)
	fail := errors.New("isolated receipt failure")
	if err := db.Callback().Create().Before("gorm:create").Register("test:fail-v94", func(tx *gorm.DB) {
		if receipt, ok := tx.Statement.Dest.(*schemaMigration); ok && receipt.Version == 94 {
			tx.AddError(fail)
		}
	}); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); !errors.Is(err, fail) {
		t.Fatalf("got %v, want injected failure", err)
	}
	var after []schemaMigration
	if err := db.Order("version").Find(&after).Error; err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, after) || db.Migrator().HasColumn(&model.DramaProduction{}, "DraftJSON") || db.Migrator().HasTable(&model.EmailLog{}) {
		t.Fatal("failed upgrade left partial schema or receipts")
	}
	if err := db.Callback().Create().Remove("test:fail-v94"); err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
}
