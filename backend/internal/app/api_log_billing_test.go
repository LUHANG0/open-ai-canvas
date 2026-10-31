package app

import (
	"encoding/csv"
	"strings"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestDecorateAPICallLogsUsesBillingOrderSnapshot(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if sqlDB, err := db.DB(); err == nil {
		sqlDB.SetMaxOpenConns(1)
	}
	if err := db.AutoMigrate(&model.User{}, &model.ModelChannel{}, &model.BillingOrder{}, &model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.User{ID: "user-1", Username: "creator", DisplayName: "创作者"}).Error; err != nil {
		t.Fatal(err)
	}

	orders := []model.BillingOrder{
		{ID: "settled", UserID: "user-1", IdempotencyKey: "settled", Status: model.BillingStatusSettled, ReservedAmountMicrocredits: 1_000_000, ActualAmountMicrocredits: 780_000, BillingCostSnapshot: model.BillingCostSnapshot{CostBillingMode: "fixed_request", CostQuantity: 1, CostPricing: model.CreditCostPricing{Configured: true, UnitPriceMicrocredits: 456_789}}},
		{ID: "reserved", UserID: "user-1", IdempotencyKey: "reserved", Status: model.BillingStatusReserved, ReservedAmountMicrocredits: 900_000},
		{ID: "uncertain", UserID: "user-1", IdempotencyKey: "uncertain", Status: model.BillingStatusUncertain, ReservedAmountMicrocredits: 1_200_000},
		{ID: "refunded", UserID: "user-1", IdempotencyKey: "refunded", Status: model.BillingStatusRefunded, ReservedAmountMicrocredits: 650_000, RefundedAmountMicrocredits: 650_000},
		{ID: "zero", UserID: "user-1", IdempotencyKey: "zero", Status: model.BillingStatusSettled, ReservedAmountMicrocredits: 100_000},
		{ID: "other-user", UserID: "user-2", IdempotencyKey: "other-user", Status: model.BillingStatusSettled, ActualAmountMicrocredits: 500_000},
	}
	if err := db.Create(&orders).Error; err != nil {
		t.Fatal(err)
	}

	logs := []model.ApiCallLog{
		{ID: "log-settled", UserID: "user-1", BillingOrderID: "settled", Capability: "text", Billable: true},
		{ID: "log-reserved", UserID: "user-1", BillingOrderID: "reserved", Capability: "text", Billable: true},
		{ID: "log-uncertain", UserID: "user-1", BillingOrderID: "uncertain", Capability: "text", Billable: true},
		{ID: "log-refunded", UserID: "user-1", BillingOrderID: "refunded", Capability: "text", Billable: true},
		{ID: "log-missing", UserID: "user-1", BillingOrderID: "missing", Capability: "text", Billable: true},
		{ID: "log-other-user", UserID: "user-1", BillingOrderID: "other-user", Capability: "text", Billable: true},
		{ID: "log-download", UserID: "user-1", BillingOrderID: "settled", Capability: "image", RequestKind: "download", Billable: false},
		{ID: "log-zero", UserID: "user-1", BillingOrderID: "zero", Capability: "text", Billable: true},
	}

	svc := &Service{repo: repository.New(db)}
	if err := svc.decorateAPICallLogs(logs); err != nil {
		t.Fatal(err)
	}

	for index, want := range []any{float64(780_000), nil, nil, nil, nil, nil, nil, float64(0)} {
		values := reportJSON(t, logs[index])
		if values["billingSettledMicrocredits"] != want {
			t.Errorf("settled amount for %s = %v, want %v", logs[index].ID, values["billingSettledMicrocredits"], want)
		}
	}
	if value := reportJSON(t, logs[1])["billingReservedMicrocredits"]; value != float64(900_000) {
		t.Errorf("reserved amount = %v", value)
	}

	assertBillingSnapshot(t, logs[0], true, model.BillingStatusSettled, 780_000)
	assertBillingSnapshot(t, logs[1], true, model.BillingStatusReserved, 900_000)
	assertBillingSnapshot(t, logs[2], true, model.BillingStatusUncertain, 1_200_000)
	assertBillingSnapshot(t, logs[3], true, model.BillingStatusRefunded, 0)
	assertBillingSnapshot(t, logs[4], false, "", 0)
	assertBillingSnapshot(t, logs[5], false, "", 0)
	assertBillingSnapshot(t, logs[6], false, "", 0)
	if !logs[0].CreditCostConfigured || logs[0].CreditCostMicrocredits == nil || *logs[0].CreditCostMicrocredits != 456_789 {
		t.Fatalf("request cost missing: %#v", logs[0])
	}
	for _, log := range logs[1:] {
		if log.CreditCostConfigured || log.CreditCostMicrocredits != nil {
			t.Fatalf("fabricated cost for %s", log.ID)
		}
	}
	// The exported values must preserve blank (unsettled) versus explicit zero.
	if err := db.Create(&logs).Error; err != nil {
		t.Fatal(err)
	}
	data, err := svc.AdminAPICallLogsCSV(&model.User{Role: model.UserRoleAdmin}, APICallLogQuery{RecordType: "all"})
	if err != nil {
		t.Fatal(err)
	}
	rows, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(string(data), "\xEF\xBB\xBF"))).ReadAll()
	if err != nil {
		t.Fatal(err)
	}
	columns := map[string]int{}
	for index, name := range rows[0] {
		columns[name] = index
	}
	reservedIndex, reservedOK := columns["预授权(微积分)"]
	settledIndex, settledOK := columns["实收(微积分)"]
	if !reservedOK || !settledOK {
		t.Fatalf("missing billing columns: %v", rows[0])
	}
	seenZero, seenReserved := false, false
	for _, row := range rows[1:] {
		if row[reservedIndex] == "100000" && row[settledIndex] == "0" {
			seenZero = true
		}
		if row[reservedIndex] == "900000" && row[settledIndex] == "" {
			seenReserved = true
		}
	}
	if !seenZero || !seenReserved {
		t.Fatalf("CSV lost zero or unsettled values: %v", rows)
	}
}

func assertBillingSnapshot(t *testing.T, log model.ApiCallLog, available bool, status model.BillingStatus, amount int64) {
	t.Helper()
	if log.BillingAvailable != available || log.BillingStatus != status || log.BillingAmount != amount {
		t.Fatalf("billing snapshot for %s = {available:%v status:%q amount:%d}, want {available:%v status:%q amount:%d}", log.ID, log.BillingAvailable, log.BillingStatus, log.BillingAmount, available, status, amount)
	}
}
