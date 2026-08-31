package repository

import (
	"errors"
	"testing"

	"infinite-canvas/backend/internal/model"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTokenUsageAmountSettlesArkVideoCompletionTokens(t *testing.T) {
	amount, err := tokenUsageAmount(model.BillingOrder{
		Capability:                   "video",
		OutputTokenPriceMicrocredits: 16_000_000,
		MultiplierBasisPoints:        10_000,
	}, &BillingUsage{OutputTokens: 108900})
	if err != nil {
		t.Fatalf("tokenUsageAmount() error = %v", err)
	}
	if amount != 1_742_400 {
		t.Fatalf("tokenUsageAmount() = %d", amount)
	}
}

func TestBillingUsageReadsAsyncVideoPollUsage(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-token-poll?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.ApiCallLog{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "poll-log-1", BillingOrderID: "order-1", RequestKind: "poll", Billable: false,
		Status: model.ApiCallStatusSucceeded, UsageAvailable: true, OutputTokens: 108900,
	}).Error; err != nil {
		t.Fatal(err)
	}
	usage, err := billingUsage(db, "order-1")
	if err != nil {
		t.Fatalf("billingUsage() error = %v", err)
	}
	if usage.OutputTokens != 108900 {
		t.Fatalf("billingUsage() = %#v", usage)
	}
}

func TestTokenUsageAmountRejectsVideoWithoutOutputUsage(t *testing.T) {
	_, err := tokenUsageAmount(model.BillingOrder{Capability: "video", OutputTokenPriceMicrocredits: 16_000_000, MultiplierBasisPoints: 10_000}, &BillingUsage{})
	if !errors.Is(err, ErrBillingUsageUnavailable) {
		t.Fatalf("tokenUsageAmount() error = %v", err)
	}
}

func TestSettleArkVideoTokenOrderFromPollUsage(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-token-settle?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	const reserved = int64(1_916_640)
	if err := db.Create(&model.CreditAccount{UserID: "user-1", ReservedMicrocredits: reserved}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.BillingOrder{
		ID: "order-1", UserID: "user-1", IdempotencyKey: "task:task-1", Capability: "video", BillingMode: "token",
		AmountMicrocredits: reserved, ReservedAmountMicrocredits: reserved, OutputTokenPriceMicrocredits: 16_000_000,
		MultiplierBasisPoints: 10_000, Status: model.BillingStatusUncertain, Error: "旧的结果解析失败",
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "poll-log-1", BillingOrderID: "order-1", RequestKind: "poll", Billable: false,
		Status: model.ApiCallStatusSucceeded, UsageAvailable: true, OutputTokens: 108900,
	}).Error; err != nil {
		t.Fatal(err)
	}

	repo := &Repository{db: db}
	if err := repo.SettleBillingOrder("order-1", "ark-task-1"); err != nil {
		t.Fatalf("SettleBillingOrder() error = %v", err)
	}
	var order model.BillingOrder
	if err := db.First(&order, "id = ?", "order-1").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusSettled || order.ActualAmountMicrocredits != 1_742_400 || order.RefundedAmountMicrocredits != 174_240 || order.Error != "" {
		t.Fatalf("settled order = %#v", order)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user-1").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 174_240 || account.ReservedMicrocredits != 0 {
		t.Fatalf("settled account = %#v", account)
	}
	if err := repo.SettleBillingOrder("order-1", "ark-task-1"); err != nil {
		t.Fatalf("repeated SettleBillingOrder() error = %v", err)
	}
	var ledgerCount int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("billing_order_id = ?", "order-1").Count(&ledgerCount).Error; err != nil {
		t.Fatal(err)
	}
	if ledgerCount != 2 { // 一条消费 + 一条预授权差额退回
		t.Fatalf("repeated settlement wrote %d ledger rows, want 2", ledgerCount)
	}
}

func TestSettleArkVideoTokenOrderSupplementsUnderreservation(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-token-supplement?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	const (
		reserved   = int64(3_049_738)
		actual     = int64(3_115_222)
		supplement = actual - reserved
	)
	if err := db.Create(&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 1_000_000, ReservedMicrocredits: reserved}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.BillingOrder{
		ID: "order-1", UserID: "user-1", IdempotencyKey: "task:task-1", Capability: "video", BillingMode: "token",
		AmountMicrocredits: reserved, ReservedAmountMicrocredits: reserved, OutputTokenPriceMicrocredits: 18_200_000,
		MultiplierBasisPoints: 10_000, Status: model.BillingStatusRunning,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "poll-log-1", BillingOrderID: "order-1", RequestKind: "poll", Billable: false,
		Status: model.ApiCallStatusSucceeded, UsageAvailable: true, OutputTokens: 171_166,
	}).Error; err != nil {
		t.Fatal(err)
	}

	repo := &Repository{db: db}
	if err := repo.SettleBillingOrder("order-1", "ark-task-1"); err != nil {
		t.Fatalf("SettleBillingOrder() error = %v", err)
	}
	var order model.BillingOrder
	if err := db.First(&order, "id = ?", "order-1").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusSettled || order.ActualAmountMicrocredits != actual || order.OutputTokens != 171_166 || !order.UsageAvailable {
		t.Fatalf("settled order = %#v", order)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user-1").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 1_000_000-supplement || account.ReservedMicrocredits != 0 {
		t.Fatalf("settled account = %#v", account)
	}
	var entry model.CreditLedgerEntry
	if err := db.First(&entry, "billing_order_id = ? AND type = ?", "order-1", model.CreditLedgerConsume).Error; err != nil {
		t.Fatal(err)
	}
	if entry.AmountMicrocredits != -actual || entry.AvailableDeltaMicrocredits != -supplement || entry.ReservedDeltaMicrocredits != -reserved {
		t.Fatalf("consume entry = %#v", entry)
	}
}

func TestSettleArkVideoTokenOrderKeepsActualUsageForReviewInsteadOfNegativeBalance(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-token-negative-balance?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	const reserved = int64(3_049_738)
	if err := db.Create(&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 10_000, ReservedMicrocredits: reserved}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.BillingOrder{
		ID: "order-1", UserID: "user-1", IdempotencyKey: "task:task-1", Capability: "video", BillingMode: "token",
		AmountMicrocredits: reserved, ReservedAmountMicrocredits: reserved, OutputTokenPriceMicrocredits: 18_200_000,
		MultiplierBasisPoints: 10_000, Status: model.BillingStatusRunning,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "poll-log-1", BillingOrderID: "order-1", RequestKind: "poll", Billable: false,
		Status: model.ApiCallStatusSucceeded, UsageAvailable: true, OutputTokens: 171_166,
	}).Error; err != nil {
		t.Fatal(err)
	}

	repo := &Repository{db: db}
	err = repo.SettleBillingOrder("order-1", "ark-task-1")
	if !errors.Is(err, ErrBillingSupplementBalance) {
		t.Fatalf("SettleBillingOrder() error = %v, want ErrBillingSupplementBalance", err)
	}
	var order model.BillingOrder
	if err := db.First(&order, "id = ?", "order-1").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusUncertain || order.ActualAmountMicrocredits != 3_115_222 || order.OutputTokens != 171_166 || !order.UsageAvailable {
		t.Fatalf("review order = %#v", order)
	}
	if order.Error == "" {
		t.Fatalf("review order did not preserve the risk-control reason: %#v", order)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user-1").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 10_000 || account.ReservedMicrocredits != reserved {
		t.Fatalf("risk-controlled account = %#v", account)
	}
	var ledgerCount int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("billing_order_id = ?", "order-1").Count(&ledgerCount).Error; err != nil {
		t.Fatal(err)
	}
	if ledgerCount != 0 {
		t.Fatalf("risk-controlled settlement wrote %d ledger rows", ledgerCount)
	}
}

func TestSettleTokenOrderRejectsSupplementAboveConfiguredLimit(t *testing.T) {
	t.Setenv("CANVAS_BILLING_TOKEN_SUPPLEMENT_MAX_BPS", "1000") // 最多补扣预授权的 10%
	db, err := gorm.Open(sqlite.Open("file:finance-token-supplement-limit?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.ApiCallLog{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	const reserved = int64(1_000_000)
	if err := db.Create(&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 10_000_000, ReservedMicrocredits: reserved}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.BillingOrder{
		ID: "order-1", UserID: "user-1", IdempotencyKey: "task:task-1", Capability: "video", BillingMode: "token",
		AmountMicrocredits: reserved, ReservedAmountMicrocredits: reserved, OutputTokenPriceMicrocredits: 1_000_000,
		MultiplierBasisPoints: 10_000, Status: model.BillingStatusRunning,
	}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.ApiCallLog{
		ID: "poll-log-1", BillingOrderID: "order-1", RequestKind: "poll", Status: model.ApiCallStatusSucceeded,
		UsageAvailable: true, OutputTokens: 1_200_000,
	}).Error; err != nil {
		t.Fatal(err)
	}

	repo := &Repository{db: db}
	err = repo.SettleBillingOrder("order-1", "ark-task-1")
	if !errors.Is(err, ErrBillingSupplementLimit) {
		t.Fatalf("SettleBillingOrder() error = %v, want ErrBillingSupplementLimit", err)
	}
	var order model.BillingOrder
	if err := db.First(&order, "id = ?", "order-1").Error; err != nil {
		t.Fatal(err)
	}
	if order.Status != model.BillingStatusUncertain || order.ActualAmountMicrocredits != 1_200_000 || order.OutputTokens != 1_200_000 || !order.UsageAvailable {
		t.Fatalf("review order = %#v", order)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user-1").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 10_000_000 || account.ReservedMicrocredits != reserved {
		t.Fatalf("risk-controlled account = %#v", account)
	}
}

func TestRefundBillingOrderIsIdempotent(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-refund-idempotent?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 100, ReservedMicrocredits: 500}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.BillingOrder{ID: "order-1", UserID: "user-1", IdempotencyKey: "task:task-1", AmountMicrocredits: 500, ReservedAmountMicrocredits: 500, Status: model.BillingStatusRunning}).Error; err != nil {
		t.Fatal(err)
	}
	repo := New(db)
	for attempt := 0; attempt < 2; attempt++ {
		if err := repo.RefundBillingOrder("order-1", "request_not_sent"); err != nil {
			t.Fatalf("RefundBillingOrder() attempt %d error = %v", attempt+1, err)
		}
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user-1").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 600 || account.ReservedMicrocredits != 0 {
		t.Fatalf("refunded account = %#v", account)
	}
	var ledgerCount int64
	if err := db.Model(&model.CreditLedgerEntry{}).Where("billing_order_id = ?", "order-1").Count(&ledgerCount).Error; err != nil {
		t.Fatal(err)
	}
	if ledgerCount != 1 {
		t.Fatalf("repeated refund wrote %d ledger rows, want 1", ledgerCount)
	}
}

func TestNegativeBalanceBlocksNewReservationsAndAcceptsRepayment(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:finance-negative-balance-repayment?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.CreditAccount{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: -1_000_000}).Error; err != nil {
		t.Fatal(err)
	}

	repo := &Repository{db: db}
	order := model.BillingOrder{
		ID: "order-1", UserID: "user-1", IdempotencyKey: "task:task-1",
		AmountMicrocredits: 1, ReservedAmountMicrocredits: 1, Status: model.BillingStatusReserved,
	}
	if err := repo.ReserveBillingOrder(&order); !errors.Is(err, ErrInsufficientCredits) {
		t.Fatalf("ReserveBillingOrder() error = %v", err)
	}

	account, err := repo.AdjustCredits("user-1", "admin-1", 100_000_000, "充值入账")
	if err != nil {
		t.Fatalf("AdjustCredits() error = %v", err)
	}
	if account.AvailableMicrocredits != 99_000_000 {
		t.Fatalf("available balance = %d", account.AvailableMicrocredits)
	}
}
