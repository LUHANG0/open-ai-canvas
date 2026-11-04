package repository

import (
	"fmt"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
)

func TestJijiuAgentSettlesEachStepWithCachedUsageExactlyOnce(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.Name()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	const reserve int64 = 50000
	if err := db.Create(&model.CreditAccount{UserID: "user", AvailableMicrocredits: 900000, ReservedMicrocredits: 2 * reserve}).Error; err != nil {
		t.Fatal(err)
	}
	repo := &Repository{db: db}
	for i, step := range []struct{ input, output, cached, want int64 }{{10000, 2000, 4000, 10234}, {40000, 1000, 20000, 16848}} {
		id := fmt.Sprintf("agent-step-%d", i)
		order := model.BillingOrder{ID: id, UserID: "user", TaskID: id, IdempotencyKey: "task:" + id, Capability: "text", BillingMode: "token", AmountMicrocredits: reserve, ReservedAmountMicrocredits: reserve, ChargeLimitMicrocredits: reserve, InputTokenPriceMicrocredits: 624000, OutputTokenPriceMicrocredits: 3120000, CachedTokenPriceMicrocredits: 62400, MultiplierBasisPoints: 10000, Status: model.BillingStatusRunning}
		if err := db.Create(&order).Error; err != nil {
			t.Fatal(err)
		}
		log := model.ApiCallLog{ID: "log-" + id, BillingOrderID: id, TaskID: id, RequestKind: "generate", Billable: true, Status: model.ApiCallStatusSucceeded, UsageAvailable: true, InputTokens: step.input, OutputTokens: step.output, CachedTokens: step.cached}
		if err := db.Create(&log).Error; err != nil {
			t.Fatal(err)
		}
		for repeat := 0; repeat < 2; repeat++ {
			if err := repo.SettleBillingOrder(id, "provider-"+id); err != nil {
				t.Fatal(err)
			}
		}
		if err := db.First(&order, "id = ?", id).Error; err != nil {
			t.Fatal(err)
		}
		if order.Status != model.BillingStatusSettled || order.ActualAmountMicrocredits != step.want || order.InputTokens != step.input || order.CachedTokens != step.cached {
			t.Fatalf("step %d settlement=%#v", i, order)
		}
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	if account.ReservedMicrocredits != 0 || account.AvailableMicrocredits != 1000000-10234-16848 {
		t.Fatalf("account=%#v", account)
	}
	var consumes int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("type = ?", model.CreditLedgerConsume).Count(&consumes).Error; err != nil {
		t.Fatal(err)
	}
	if consumes != 2 {
		t.Fatalf("duplicate settlement consumed %d entries", consumes)
	}
}
