package app

import (
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestAdminModelHealthCompletedOutcomesAndWindows(t *testing.T) {
	now := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	log := func(hours int, status model.ApiCallStatus, provider string) model.ApiCallLog {
		return model.ApiCallLog{ChannelID: "a", Model: "m", RequestKind: "create", Status: status, ProviderStatus: provider, CreatedAt: now.Add(-time.Duration(hours) * time.Hour), DurationMs: int64(hours * 100), StatusCode: 502}
	}
	logs := []model.ApiCallLog{
		log(1, model.ApiCallStatusSucceeded, "running"), // Accepted work is not a completed success.
		log(2, model.ApiCallStatusFailed, "running"),    // Explicit failure wins a stale provider status.
		log(3, model.ApiCallStatusSucceeded, "failed"),
		log(4, model.ApiCallStatusSucceeded, "succeeded"),
		log(24, model.ApiCallStatusSucceeded, ""),
		log(25, model.ApiCallStatusSucceeded, ""),
		log(168, model.ApiCallStatusSucceeded, ""),
		log(169, model.ApiCallStatusFailed, ""),
	}
	for _, provider := range []string{"queued", "pending", "processing", "in_progress"} {
		logs = append(logs, log(1, model.ApiCallStatusSucceeded, provider))
	}
	poll := log(1, model.ApiCallStatusFailed, "")
	poll.RequestKind = "poll"
	logs = append(logs, poll)
	report := buildAdminChannelModelHealth(logs, now)
	if len(report.Items) != 1 {
		t.Fatalf("items = %#v", report.Items)
	}
	item := report.Items[0]
	if item.Requests24h != 4 || item.Succeeded24h != 2 || item.Failed24h != 2 || item.SuccessRate24h == nil || *item.SuccessRate24h != .5 {
		t.Fatalf("24h outcomes = %#v", item)
	}
	if item.Requests7d != 6 || item.SuccessRate7d == nil || *item.SuccessRate7d != 4.0/6 || item.P95DurationMs24h != 2400 {
		t.Fatalf("7d or duration = %#v", item)
	}
	if item.LastCalledAt == nil || !item.LastCalledAt.Equal(logs[1].CreatedAt) || item.LastErrorCode != "HTTP 502" {
		t.Fatalf("latest outcome = %#v", item)
	}
	if len(item.RecentResults) != 6 || item.RecentResults[0] != true || item.RecentResults[5] != false {
		t.Fatalf("recent order = %v", item.RecentResults)
	}
}

func TestAdminModelHealthTruncationBoundary(t *testing.T) {
	now := time.Now().UTC()
	logs := []model.ApiCallLog{
		{ChannelID: "a", Model: "m", RequestKind: "create", Status: model.ApiCallStatusSucceeded, CreatedAt: now.Add(-time.Hour)},
		{ChannelID: "a", Model: "m", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-2 * time.Hour)},
		{ChannelID: "a", Model: "m", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-3 * time.Hour)},
	}
	exact := buildBoundedAdminChannelModelHealth(logs[:2], now, 2)
	if exact.Truncated {
		t.Fatal("exactly reaching the limit is not truncation")
	}
	over := buildBoundedAdminChannelModelHealth(logs, now, 2)
	if !over.Truncated || over.Items[0].Requests24h != 2 || *over.Items[0].SuccessRate24h != .5 {
		t.Fatalf("bounded snapshot = %#v", over)
	}
}

func TestAdminModelHealthNullZeroAndRecentLimit(t *testing.T) {
	now := time.Now().UTC()
	logs := []model.ApiCallLog{{ChannelID: "b", Model: "old", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-48 * time.Hour)}}
	for i := 0; i < 12; i++ {
		logs = append(logs, model.ApiCallLog{ChannelID: "a", Model: "failed", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-time.Duration(i+1) * time.Minute)})
	}
	report := buildAdminChannelModelHealth(logs, now)
	if len(report.Items) != 2 || report.Items[0].ChannelID != "a" {
		t.Fatalf("stable order = %#v", report.Items)
	}
	failed, old := report.Items[0], report.Items[1]
	if failed.SuccessRate24h == nil || *failed.SuccessRate24h != 0 || len(failed.RecentResults) != 10 {
		t.Fatalf("real zero = %#v", failed)
	}
	if old.SuccessRate24h != nil || old.Requests24h != 0 || old.SuccessRate7d == nil || *old.SuccessRate7d != 0 {
		t.Fatalf("no 24h samples = %#v", old)
	}
}

func TestAdminModelHealthQueryScopeLimitCacheAndPermissions(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, _ := db.DB()
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := db.AutoMigrate(&model.ApiCallLog{}, &model.ModelChannel{}); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	for _, channel := range []model.ModelChannel{{ID: "system", Scope: model.ChannelScopeSystem, Enabled: false}, {ID: "private", Scope: model.ChannelScopeUser, UserID: "user", Enabled: true}} {
		if err := db.Create(&channel).Error; err != nil {
			t.Fatal(err)
		}
	}
	logs := []model.ApiCallLog{
		{ID: "accepted", ChannelID: "system", Model: "m", RequestKind: "create", Status: model.ApiCallStatusSucceeded, ProviderStatus: "running", CreatedAt: now.Add(-time.Minute)},
		{ID: "complete", ChannelID: "system", Model: "m", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-2 * time.Minute)},
		{ID: "private", ChannelID: "private", Model: "secret-model", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-time.Minute)},
		{ID: "poll", ChannelID: "system", Model: "m", RequestKind: "poll", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-time.Minute)},
		{ID: "too-old", ChannelID: "system", Model: "m", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(-8 * 24 * time.Hour)},
		{ID: "future", ChannelID: "system", Model: "m", RequestKind: "create", Status: model.ApiCallStatusFailed, CreatedAt: now.Add(time.Hour)},
	}
	if err := db.Create(&logs).Error; err != nil {
		t.Fatal(err)
	}
	svc := &Service{repo: repository.New(db)}
	filter := repository.PublicModelAvailabilityFilter{ChannelIDs: []string{"system"}, From: now.Add(-7 * 24 * time.Hour), To: now}
	rows, err := svc.repo.AdminModelHealthLogs(filter, 1)
	if err != nil || len(rows) != 1 || rows[0].ProviderStatus != "running" {
		t.Fatalf("compact bounded query: %#v, %v", rows, err)
	}
	admin := &model.User{Role: model.UserRoleAdmin}
	for _, actor := range []*model.User{nil, {Role: model.UserRoleUser}} {
		if _, err := svc.AdminChannelModelHealth(actor, ""); err == nil {
			t.Fatal("non-admin health allowed")
		}
		if _, err := svc.AdminAllChannelModels(actor); err == nil {
			t.Fatal("non-admin models allowed")
		}
	}
	for _, id := range []string{"private", "missing"} {
		if _, err := svc.AdminChannelModelHealth(admin, id); err == nil {
			t.Fatalf("invalid channel %q allowed", id)
		}
	}
	report, err := svc.cachedAdminChannelModelHealth(now)
	if err != nil || len(report.Items) != 1 || report.Items[0].Requests7d != 1 || report.Items[0].ModelKey != "m" || report.Truncated {
		t.Fatalf("report %#v, %v", report, err)
	}
	if err := db.Exec("DROP TABLE api_call_logs").Error; err != nil {
		t.Fatal(err)
	}
	cached, err := svc.cachedAdminChannelModelHealth(now.Add(time.Second))
	if err != nil || cached != report {
		t.Fatalf("cache not reused: %v", err)
	}
	if _, err := svc.cachedAdminChannelModelHealth(now.Add(adminModelHealthCacheTTL)); err == nil {
		t.Fatal("expired cache masked query error")
	}
}
