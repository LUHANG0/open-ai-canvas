package repository

import (
	"fmt"
	"strings"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func TestReferenceVideoLedgerNote(t *testing.T) {
	for _, test := range []struct {
		order model.BillingOrder
		want  string
	}{
		{order: model.BillingOrder{}, want: ""},
		{order: model.BillingOrder{ReferenceVideoCount: 1, ReferenceVideoMillis: 8_000, ReferenceVideoBilled: true}, want: "参考视频 8 秒已计费"},
		{order: model.BillingOrder{ReferenceVideoCount: 2, ReferenceVideoMillis: 7_250}, want: "参考视频 7.2 秒未计费"},
		{order: model.BillingOrder{ReferenceVideoCount: 2}, want: "参考视频 2 个未计费"},
	} {
		if got := referenceVideoLedgerNote(test.order); got != test.want {
			t.Fatalf("referenceVideoLedgerNote(%#v) = %q, want %q", test.order, got, test.want)
		}
	}
	// 参考视频不计费的视频 Token 订单不读上游 usage（含参考视频），按生成时长公式快照结算。
	usage, source, err := tokenSettlementUsage(nil, model.BillingOrder{Capability: "video", ReferenceVideoCount: 1, VideoFormulaTokens: 108_000})
	if err != nil || source != billingUsageSourceVideoFormula || usage.OutputTokens != 108_000 {
		t.Fatalf("tokenSettlementUsage() = %#v %q %v", usage, source, err)
	}
	if got := joinLedgerNotes("视频按实际输出时长结算", "", "参考视频 8 秒已计费"); got != "视频按实际输出时长结算；参考视频 8 秒已计费" {
		t.Fatalf("joinLedgerNotes() = %q", got)
	}
}

func TestReferenceVideoSettlementCountsReferencesOnce(t *testing.T) {
	for _, billed := range []bool{false, true} {
		t.Run(fmt.Sprint(billed), func(t *testing.T) {
			db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
			if err != nil {
				t.Fatal(err)
			}
			if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}); err != nil {
				t.Fatal(err)
			}
			repo := &Repository{db: db}
			if err := db.Create(&model.CreditAccount{UserID: "owner", AvailableMicrocredits: 10_000}).Error; err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.CreditAccount{UserID: "other-owner", AvailableMicrocredits: 9_999}).Error; err != nil {
				t.Fatal(err)
			}
			order := model.BillingOrder{ID: "video", UserID: "owner", IdempotencyKey: "original-task", Capability: "video", BillingMode: "per_second", UnitPriceMicrocredits: 100, MultiplierBasisPoints: 10_000, Quantity: 13, AmountMicrocredits: 1_300, ReservedAmountMicrocredits: 1_300, Status: model.BillingStatusRunning, ReferenceVideoCount: 1, ReferenceVideoMillis: 7_200, ReferenceVideoBilled: billed, BillingCostSnapshot: model.BillingCostSnapshot{CostBillingMode: "per_second", CostQuantity: 13}}
			if err := repo.ReserveBillingOrder(&order); err != nil {
				t.Fatal(err)
			}
			for i := 0; i < 2; i++ {
				if err := repo.SettleBillingOrderWithAudioDuration(order.ID, "same-provider-task", 4_100); err != nil {
					t.Fatal(err)
				}
			}
			var saved model.BillingOrder
			if err := db.First(&saved, "id = ?", order.ID).Error; err != nil {
				t.Fatal(err)
			}
			quantity := int64(5)
			if billed {
				quantity += 8
			}
			if saved.Quantity != quantity || saved.ActualAmountMicrocredits != quantity*100 || saved.CostQuantity != quantity || saved.ProviderRequestID != "same-provider-task" {
				t.Fatalf("incorrect settlement: %+v", saved)
			}
			var accounts []model.CreditAccount
			if err := db.Order("user_id").Find(&accounts).Error; err != nil || len(accounts) != 2 {
				t.Fatalf("accounts: %v", err)
			}
			for _, account := range accounts {
				want := int64(9_999)
				if account.UserID == "owner" {
					want = 10_000 - quantity*100
				}
				if account.AvailableMicrocredits != want || account.ReservedMicrocredits != 0 {
					t.Fatalf("balance changed incorrectly: %+v", account)
				}
			}
			var consumes []model.CreditLedgerEntry
			if err := db.Where("billing_order_id = ? AND type = ?", order.ID, model.CreditLedgerConsume).Find(&consumes).Error; err != nil || len(consumes) != 1 || !strings.Contains(consumes[0].Note, "参考视频 7.2 秒") {
				t.Fatalf("duplicate/missing consumption or reference note: %+v / %v", consumes, err)
			}
		})
	}
}
