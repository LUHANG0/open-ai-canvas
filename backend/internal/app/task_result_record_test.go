package app

import (
	"encoding/json"
	"strings"
	"testing"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestTaskBillingActualReadModel(t *testing.T) {
	tests := []struct {
		name   string
		status model.BillingStatus
		actual int64
		known  bool
	}{
		{"settled differs from reservation", model.BillingStatusSettled, 8_800_000, true},
		{"settled zero", model.BillingStatusSettled, 0, true},
		{"reserved is not actual", model.BillingStatusReserved, 8_800_000, false},
		{"running is not actual", model.BillingStatusRunning, 8_800_000, false},
		{"uncertain is not actual", model.BillingStatusUncertain, 8_800_000, false},
		{"refunded is not settled", model.BillingStatusRefunded, 8_800_000, false},
		{"invalid actual", model.BillingStatusSettled, -1, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			summary := taskBillingSummary(model.BillingOrder{AmountMicrocredits: 10_000_000, ActualAmountMicrocredits: tc.actual, Status: tc.status})
			if summary.AmountMicrocredits != 10_000_000 || summary.Status != tc.status {
				t.Fatalf("original order contract changed: %+v", summary)
			}
			if (summary.ActualAmountMicrocredits != nil) != tc.known || (tc.known && *summary.ActualAmountMicrocredits != tc.actual) {
				t.Fatalf("actual/unknown mismatch: %+v", summary)
			}
			raw, err := json.Marshal(summary)
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]any
			if err := json.Unmarshal(raw, &payload); err != nil {
				t.Fatal(err)
			}
			_, exists := payload["actualAmountMicrocredits"]
			if exists != tc.known {
				t.Fatalf("zero and unknown must serialize differently: %s", raw)
			}
		})
	}
}

func TestTaskBillingSummaryDoesNotExposeOrderInternals(t *testing.T) {
	tasks := []model.Task{{ID: "task", UserID: "owner", InputJSON: `{"config":{"apiKey":"private-secret"}}`}}
	orders := map[string]model.BillingOrder{"task": {ID: "order", UserID: "owner", TaskID: "task", ChannelID: "private-channel", ChannelModelID: "private-model", AmountMicrocredits: 10_000_000, ActualAmountMicrocredits: 8_800_000, Status: model.BillingStatusSettled}}
	rows := taskSummariesForOutputWithBilling(tasks, orders)
	if rows[0].Billing == nil || *rows[0].Billing.ActualAmountMicrocredits != 8_800_000 {
		t.Fatalf("missing actual charge: %+v", rows)
	}
	raw, err := json.Marshal(rows)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"private-secret", "private-channel", "private-model", "inputJson", "channelId", "channelModelId", "unitPriceMicrocredits"} {
		if strings.Contains(string(raw), private) {
			t.Fatalf("billing read model leaked %q: %s", private, raw)
		}
	}
}

func TestTaskDetailBillingKeepsOwnershipAndRedaction(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Task{}, &model.BillingOrder{}); err != nil {
		t.Fatal(err)
	}
	task := model.Task{ID: "task", UserID: "owner", Status: model.TaskStatusSucceeded, BillingOrderID: "order", ProviderRequestID: "provider-request", LogicalModelRevisionID: "private-revision", RouteID: "private-route", ChannelModelID: "private-model", InputJSON: `{"config":{"apiKey":"private-secret"}}`}
	if err := db.Create(&task).Error; err != nil {
		t.Fatal(err)
	}
	order := model.BillingOrder{ID: "order", UserID: "owner", TaskID: "task", IdempotencyKey: "unique", AmountMicrocredits: 10_000_000, ActualAmountMicrocredits: 8_800_000, Status: model.BillingStatusSettled}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	if result, err := svc.Task("other", task.ID); err == nil || result != nil {
		t.Fatalf("other user read succeeded: %+v %v", result, err)
	}
	result, err := svc.Task("owner", task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if result.ID != task.ID || result.Billing == nil || *result.Billing.ActualAmountMicrocredits != 8_800_000 {
		t.Fatalf("detail actual missing: %+v", result)
	}
	raw, err := json.Marshal(result)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"private-revision", "private-route", "private-model", "private-secret"} {
		if strings.Contains(string(raw), private) {
			t.Fatalf("detail leaked %q: %s", private, raw)
		}
	}
	if err := db.Model(&order).Update("user_id", "other").Error; err != nil {
		t.Fatal(err)
	}
	result, err = svc.Task("owner", task.ID)
	if err != nil || result.Billing != nil {
		t.Fatalf("foreign billing joined to owned task: %+v %v", result, err)
	}
	if err := db.Migrator().DropTable(&model.BillingOrder{}); err != nil {
		t.Fatal(err)
	}
	result, err = svc.Task("owner", task.ID)
	if err != nil || result == nil || result.ID != task.ID || result.Billing != nil {
		t.Fatalf("unknown billing must not change task read success: %+v %v", result, err)
	}
}
