package database

import (
	"errors"
	"reflect"
	"testing"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

// Build an isolated Schema 94 fixture, removing new-model columns so migration
// 95 must actually add them. Production receipts and data are never inputs.
func schema94DramaFixture(t *testing.T, db *gorm.DB) []schemaMigration {
	t.Helper()
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	for _, change := range []struct {
		entity any
		field  string
	}{
		{&model.DramaCast{}, "ImagePrompt"},
		{&model.DramaSegment{}, "ReferenceImagesJSON"},
		{&model.DramaSegment{}, "AudioCastIDsJSON"},
	} {
		if err := db.Migrator().DropColumn(change.entity, change.field); err != nil {
			t.Fatal(err)
		}
	}
	if err := db.Where("version = ?", 95).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO drama_casts (id, project_id, appearance, image_resource_id, image_status, locked) VALUES ('old-cast', 'old-project', '白衣', 'old-image', 'ready', true)`,
		`INSERT INTO drama_segments (id, project_id, reference_cast_ids_json, revision) VALUES ('old-segment', 'old-project', '["old-cast"]', 7)`,
		`INSERT INTO channel_model_price_tiers (id, channel_model_id, selector_key, unit_price_microcredits, reference_video_unit_price_microcredits, cost_reference_video_unit_price_microcredits) VALUES ('kept-tier', 'kept-model', '{}', 1500000, 2500000, 750000)`,
	} {
		if err := db.Exec(q).Error; err != nil {
			t.Fatal(err)
		}
	}
	var receipts []schemaMigration
	if err := db.Order("version").Find(&receipts).Error; err != nil {
		t.Fatal(err)
	}
	// Version numbers include reserved slots, so Schema 94 need not have 94 rows.
	plan, err := migrationsForDatabase(db)
	if err != nil {
		t.Fatal(err)
	}
	expected := 0
	for _, migration := range plan {
		if migration.version > 94 {
			continue
		}
		if expected >= len(receipts) || receipts[expected].Version != migration.version || receipts[expected].Checksum != migration.checksum {
			t.Fatalf("missing or changed pre-95 receipt for version %d", migration.version)
		}
		expected++
	}
	if len(receipts) != expected || receipts[len(receipts)-1].Version != 94 {
		t.Fatalf("fixture has an unexpected Schema 94 migration history: %d rows", len(receipts))
	}
	return receipts
}

func TestDramaControlsUpgrade94To95PreservesDataAndReceipts(t *testing.T) {
	mengcengUpgradeDatabases(t, func(t *testing.T, db *gorm.DB) {
		before := schema94DramaFixture(t, db)
		for i := 0; i < 2; i++ {
			if err := MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		if err := RequireSchemaVersion(db); err != nil {
			t.Fatal(err)
		}
		var after []schemaMigration
		if err := db.Where("version <= ?", 94).Order("version").Find(&after).Error; err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) {
			t.Fatal("published migration receipts changed")
		}
		var cast model.DramaCast
		var segment model.DramaSegment
		if err := db.First(&cast, "id = ?", "old-cast").Error; err != nil {
			t.Fatal(err)
		}
		if err := db.First(&segment, "id = ?", "old-segment").Error; err != nil {
			t.Fatal(err)
		}
		if cast.Appearance != "白衣" || cast.ImageResourceID != "old-image" || cast.ImageStatus != "ready" || !cast.Locked || cast.ImagePrompt != "" || segment.ReferenceCastIDsJSON != `["old-cast"]` || segment.Revision != 7 || segment.ReferenceImagesJSON != "" || segment.AudioCastIDsJSON != "" {
			t.Fatalf("old media/references changed: %+v %+v", cast, segment)
		}
		var price struct{ UnitPriceMicrocredits, ReferenceVideoUnitPriceMicrocredits, CostReferenceVideoUnitPriceMicrocredits int64 }
		if err := db.Table("channel_model_price_tiers").Where("id = ?", "kept-tier").Scan(&price).Error; err != nil {
			t.Fatal(err)
		}
		if price.UnitPriceMicrocredits != 1500000 || price.ReferenceVideoUnitPriceMicrocredits != 2500000 || price.CostReferenceVideoUnitPriceMicrocredits != 750000 {
			t.Fatalf("fork reference prices changed: %+v", price)
		}
	})
}

func TestDramaControlsUpgrade95FailureRollsBackAndRetries(t *testing.T) {
	mengcengUpgradeDatabases(t, func(t *testing.T, db *gorm.DB) {
		before := schema94DramaFixture(t, db)
		injected := errors.New("isolated migration95 receipt failure")
		if err := db.Callback().Create().Before("gorm:create").Register("test:fail-v95", func(tx *gorm.DB) {
			if receipt, ok := tx.Statement.Dest.(*schemaMigration); ok && receipt.Version == 95 {
				tx.AddError(injected)
			}
		}); err != nil {
			t.Fatal(err)
		}
		if err := MigrateSchema(db); !errors.Is(err, injected) {
			t.Fatalf("expected injected failure, got %v", err)
		}
		var after []schemaMigration
		if err := db.Order("version").Find(&after).Error; err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(before, after) || db.Migrator().HasColumn(&model.DramaCast{}, "ImagePrompt") || db.Migrator().HasColumn(&model.DramaSegment{}, "ReferenceImagesJSON") || db.Migrator().HasColumn(&model.DramaSegment{}, "AudioCastIDsJSON") {
			t.Fatal("failed migration left schema or receipt changes")
		}
		if err := db.Callback().Create().Remove("test:fail-v95"); err != nil {
			t.Fatal(err)
		}
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		if err := RequireSchemaVersion(db); err != nil {
			t.Fatal(err)
		}
	})
}
