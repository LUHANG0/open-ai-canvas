package app

import (
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func reportJSON(t *testing.T, value any) map[string]any {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func TestAdminReportRatesOnlyUseFinishedSamples(t *testing.T) {
	now := time.Date(2026, 10, 29, 12, 0, 0, 0, time.UTC)
	filter := repository.AnalyticsFilter{From: now.Add(-time.Hour), To: now.Add(time.Hour)}
	for _, complete := range []bool{false, true} {
		t.Run(fmt.Sprint(complete), func(t *testing.T) {
			tasks := []model.Task{{Model: "m", Status: model.TaskStatusRunning}, {Model: "m", Status: model.TaskStatusQueued}, {Model: "m", Status: model.TaskStatusCancelled}}
			logs := []model.ApiCallLog{{Model: "m", RequestKind: "create", Status: model.ApiCallStatusSucceeded, ProviderStatus: "running", CreatedAt: now}}
			if complete {
				tasks = append(tasks, model.Task{Model: "m", Status: model.TaskStatusSucceeded}, model.Task{Model: "m", Status: model.TaskStatusFailed})
				logs = append(logs, model.ApiCallLog{Model: "m", RequestKind: "create", Status: model.ApiCallStatusSucceeded, CreatedAt: now}, model.ApiCallLog{Model: "m", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now})
			}
			overview := buildAnalyticsOverview(filter, tasks, nil, nil, logs, nil, nil)
			var want any
			if complete {
				want = float64(50)
			}
			if value := reportJSON(t, overview.KPI)["successRate"]; value != want {
				t.Errorf("KPI success rate = %v, want %v", value, want)
			}
			if value := reportJSON(t, overview.Trend[0])["requestSuccessRate"]; value != want {
				t.Errorf("trend success rate = %v, want %v", value, want)
			}
			for _, row := range overview.Models {
				values := reportJSON(t, row)
				if values["taskSuccessRate"] != want || values["requestSuccessRate"] != want {
					t.Errorf("model rates = %v, want %v", values, want)
				}
			}
		})
	}
}

func TestAdminReportAsyncProviderOutcomes(t *testing.T) {
	for _, status := range []string{"queued", "pending", "processing", "running", "in_progress", " RUNNING "} {
		if got := successRateLogs([]model.ApiCallLog{{Status: model.ApiCallStatusSucceeded, ProviderStatus: status}}); got != nil {
			t.Errorf("pending provider %q reported success rate %v", status, *got)
		}
	}
	for _, status := range []string{"failed", "cancelled", "canceled", "expired"} {
		got := successRateLogs([]model.ApiCallLog{{Status: model.ApiCallStatusSucceeded, ProviderStatus: status}})
		if got == nil || *got != 0 {
			t.Errorf("failed provider %q must report a real 0%%, got %v", status, got)
		}
	}
	got := successRateLogs([]model.ApiCallLog{{Status: model.ApiCallStatusFailed, ProviderStatus: "running"}})
	if got == nil || *got != 0 {
		t.Fatal("explicit request failure must not be hidden by stale provider state")
	}
}

func TestAdminBillingOrderPageIncludesOlderUserIdentity(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.BillingOrder{}); err != nil {
		t.Fatal(err)
	}
	users := []model.User{{ID: "older", Username: "older-account", DisplayName: "老用户", CreatedAt: time.Now().Add(-365 * 24 * time.Hour)}}
	for i := 0; i < 101; i++ {
		users = append(users, model.User{ID: fmt.Sprint(i), Username: fmt.Sprint(i)})
	}
	if err := db.Create(&users).Error; err != nil {
		t.Fatal(err)
	}
	order := model.BillingOrder{ID: "order", UserID: "older", IdempotencyKey: "order", Status: model.BillingStatusSettled}
	if err := db.Create(&order).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	page, err := svc.AdminBillingOrderPage(&model.User{Role: model.UserRoleAdmin}, AdminListQuery{})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Orders) != 1 || page.Total != 1 {
		t.Fatalf("page = %+v", page)
	}
	values := reportJSON(t, page.Orders[0])
	if values["userDisplayName"] != "老用户" || values["userAccount"] != "older-account" {
		t.Fatalf("identity missing: %v", values)
	}
	if _, err := svc.AdminBillingOrderPage(&model.User{Role: model.UserRoleUser}, AdminListQuery{}); err == nil {
		t.Fatal("non-admin must not read billing orders")
	}
}
