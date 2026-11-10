package database

import (
	"errors"
	"reflect"
	"testing"
	"time"

	"yingce/backend/internal/model"

	"gorm.io/gorm"
)

// Build a schema-90 pricing/ledger fixture without the new columns. The real
// frozen-release upgrade is also exercised on an isolated production clone.
func TestMengCengV181UpgradePreservesPricesAndLedger(t *testing.T) {
	mengcengUpgradeDatabases(t, func(t *testing.T, db *gorm.DB) {
		if err := db.AutoMigrate(&schemaMigration{}, &model.ChannelModel{}, &model.ChannelModelPriceTier{}, &model.BillingOrder{}); err != nil {
			t.Fatal(err)
		}
		var receipts []schemaMigration
		for _, step := range schemaMigrations {
			if step.version <= 90 {
				receipts = append(receipts, schemaMigration{Version: step.version, Name: step.name, Checksum: step.checksum, AppliedAt: time.Date(2026, 11, 5, 0, 0, 0, 0, time.UTC)})
			}
		}
		if err := db.Create(&receipts).Error; err != nil {
			t.Fatal(err)
		}
		models := []model.ChannelModel{
			{ID: "token", ChannelID: "c", ModelKey: "custom-token", Capability: "video", DisplayName: "管理员名称", PriceCurrency: "USD"},
			{ID: "mixed", ChannelID: "c", ModelKey: "custom-mixed", Capability: "video"},
			{ID: "second", ChannelID: "c", ModelKey: "custom-second", Capability: "video"},
		}
		tiers := []model.ChannelModelPriceTier{
			{ID: "t", ChannelModelID: "token", SelectorKey: "{}", BillingMode: "token", OutputTokenPriceMicrocredits: 12_345_678, CostPricing: model.CreditCostPricing{Configured: true, OutputTokenPriceMicrocredits: 7_654_321}},
			{ID: "mt", ChannelModelID: "mixed", SelectorKey: "{}", BillingMode: "token", OutputTokenPriceMicrocredits: 23_456_789},
			{ID: "ms", ChannelModelID: "mixed", SelectorKey: `{"vquality":"1080p"}`, BillingMode: "per_second", UnitPriceMicrocredits: 987_654},
			{ID: "s", ChannelModelID: "second", SelectorKey: "{}", BillingMode: "per_second", UnitPriceMicrocredits: 123_456},
		}
		order := model.BillingOrder{ID: "historical-order", UserID: "account-a", TaskID: "historical-task", IdempotencyKey: "keep-original", Status: model.BillingStatusSettled, AmountMicrocredits: 123_456, ActualAmountMicrocredits: 100_001, RefundedAmountMicrocredits: 23_455, VideoFormulaTokens: 108_000, BillingCostSnapshot: model.BillingCostSnapshot{CostPricing: model.CreditCostPricing{Configured: true, OutputTokenPriceMicrocredits: 7_654_321}}}
		for _, value := range []any{&models, &tiers, &order} {
			if err := db.Create(value).Error; err != nil {
				t.Fatal(err)
			}
		}
		if err := db.First(&order, "id = ?", order.ID).Error; err != nil {
			t.Fatal(err)
		}
		if err := db.Order("version").Find(&receipts).Error; err != nil {
			t.Fatal(err)
		}
		for _, target := range []struct {
			entity any
			fields []string
		}{
			{&model.ChannelModel{}, []string{"reference_video_billing"}},
			{&model.ChannelModelPriceTier{}, []string{"reference_video_unit_price_microcredits", "reference_video_output_token_price_microcredits", "cost_reference_video_unit_price_microcredits", "cost_reference_video_output_token_price_microcredits"}},
			{&model.BillingOrder{}, []string{"reference_video_count", "reference_video_millis", "reference_video_billed", "cost_reference_video_unit_price_microcredits", "cost_reference_video_output_token_price_microcredits"}},
		} {
			for _, field := range target.fields {
				if err := db.Migrator().DropColumn(target.entity, field); err != nil {
					t.Fatal(err)
				}
			}
		}
		// A late failure must roll back both new receipts, the first migration's
		// columns and its automatic enablement. Restore the plan before retrying.
		original := schemaMigrations[len(schemaMigrations)-1].apply
		injected := errors.New("isolated migration failure")
		schemaMigrations[len(schemaMigrations)-1].apply = func(tx *gorm.DB) error {
			if err := original(tx); err != nil {
				return err
			}
			return injected
		}
		err := MigrateSchema(db)
		schemaMigrations[len(schemaMigrations)-1].apply = original
		if !errors.Is(err, injected) {
			t.Fatalf("expected injected failure, got %v", err)
		}
		status, err := ReadSchemaStatus(db)
		if err != nil || status.Current != 90 || db.Migrator().HasColumn(&model.ChannelModel{}, "reference_video_billing") {
			t.Fatalf("failed migration did not roll back: %+v / %v", status, err)
		}
		for round := 0; round < 2; round++ {
			if err := MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
		}
		var savedReceipts []schemaMigration
		if err := db.Where("version <= ?", 90).Order("version").Find(&savedReceipts).Error; err != nil || !reflect.DeepEqual(receipts, savedReceipts) {
			t.Fatalf("published receipts changed: %v", err)
		}
		var savedOrder model.BillingOrder
		if err := db.First(&savedOrder, "id = ?", order.ID).Error; err != nil || !reflect.DeepEqual(order, savedOrder) {
			t.Fatalf("historical billing changed: %v\nbefore=%+v\nafter=%+v", err, order, savedOrder)
		}
		for _, before := range tiers {
			var after model.ChannelModelPriceTier
			if err := db.First(&after, "id = ?", before.ID).Error; err != nil {
				t.Fatal(err)
			}
			if after.UnitPriceMicrocredits != before.UnitPriceMicrocredits || after.OutputTokenPriceMicrocredits != before.OutputTokenPriceMicrocredits || after.CostPricing.OutputTokenPriceMicrocredits != before.CostPricing.OutputTokenPriceMicrocredits {
				t.Fatalf("custom sale/cost changed for %s", before.ID)
			}
			if before.ChannelModelID == "token" && (after.ReferenceVideoOutputTokenPriceMicrocredits != before.OutputTokenPriceMicrocredits || after.CostPricing.ReferenceVideoOutputTokenPriceMicrocredits != before.CostPricing.OutputTokenPriceMicrocredits) {
				t.Fatalf("existing token price not retained for %s", before.ID)
			}
		}
		for _, before := range models {
			var after model.ChannelModel
			if err := db.First(&after, "id = ?", before.ID).Error; err != nil {
				t.Fatal(err)
			}
			if after.ReferenceVideoBilling != (before.ID == "token") || after.DisplayName != before.DisplayName || after.PriceCurrency != before.PriceCurrency {
				t.Fatalf("unexpected model migration for %s: %+v", before.ID, after)
			}
		}
		// Once applied, another startup must preserve administrator edits to
		// the new sale and cost fields, too.
		if err := db.Model(&model.ChannelModelPriceTier{}).Where("id = ?", "t").Updates(map[string]any{"reference_video_output_token_price_microcredits": 55_555_555, "cost_reference_video_output_token_price_microcredits": 33_333_333}).Error; err != nil {
			t.Fatal(err)
		}
		if err := MigrateSchema(db); err != nil {
			t.Fatal(err)
		}
		var edited model.ChannelModelPriceTier
		if err := db.First(&edited, "id = ?", "t").Error; err != nil || edited.ReferenceVideoOutputTokenPriceMicrocredits != 55_555_555 || edited.CostPricing.ReferenceVideoOutputTokenPriceMicrocredits != 33_333_333 {
			t.Fatalf("repeat migration overwrote admin reference prices: %v", err)
		}
	})
}
