package repository

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"

	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestCreateTaskIdempotencyConcurrentReservation(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:"+t.TempDir()+"/task-idempotency.db?_busy_timeout=5000&_journal_mode=WAL"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	// 单连接使 SQLite 写事务按序等待；并发调用仍会在数据库唯一约束处决胜。
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	assertConcurrentTaskIdempotencyReservation(t, db)
}

func TestPostgresCreateTaskIdempotencyConcurrentReservation(t *testing.T) {
	dsn := strings.TrimSpace(os.Getenv("CANVAS_TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}
	base, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	baseSQL, err := base.DB()
	if err != nil {
		t.Fatal(err)
	}
	schemaName := fmt.Sprintf("task_idempotency_%d", time.Now().UnixNano())
	if err := base.Exec(`CREATE SCHEMA "` + schemaName + `"`).Error; err != nil {
		_ = baseSQL.Close()
		t.Fatalf("create postgres test schema: %v", err)
	}
	testDSN, err := postgresDSNForTaskIdempotencyTest(dsn, schemaName)
	if err != nil {
		_ = base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error
		_ = baseSQL.Close()
		t.Fatal(err)
	}
	db, err := gorm.Open(postgres.Open(testDSN), &gorm.Config{})
	if err != nil {
		_ = base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error
		_ = baseSQL.Close()
		t.Fatalf("open isolated postgres schema: %v", err)
	}
	dbSQL, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	dbSQL.SetMaxOpenConns(8)
	t.Cleanup(func() {
		_ = dbSQL.Close()
		if err := base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error; err != nil {
			t.Errorf("drop postgres test schema: %v", err)
		}
		_ = baseSQL.Close()
	})
	assertConcurrentTaskIdempotencyReservation(t, db)
}

func postgresDSNForTaskIdempotencyTest(dsn string, schemaName string) (string, error) {
	if strings.Contains(dsn, "://") {
		parsed, err := url.Parse(dsn)
		if err != nil {
			return "", err
		}
		query := parsed.Query()
		query.Set("search_path", schemaName)
		parsed.RawQuery = query.Encode()
		return parsed.String(), nil
	}
	return strings.TrimSpace(dsn) + " search_path=" + schemaName, nil
}

func assertConcurrentTaskIdempotencyReservation(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.AutoMigrate(&model.Task{}, &model.CreditAccount{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditAccount{UserID: "user-1", AvailableMicrocredits: 1_000}).Error; err != nil {
		t.Fatal(err)
	}

	repo := New(db)
	const attempts = 12
	key := "concurrent-task-key-0001"
	start := make(chan struct{})
	errorsByAttempt := make([]error, attempts)
	var wg sync.WaitGroup
	for index := 0; index < attempts; index++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			taskID := "task-" + string(rune('a'+index))
			task := &model.Task{ID: taskID, UserID: "user-1", IdempotencyKey: &key, IdempotencyFingerprint: "same-fingerprint", Status: model.TaskStatusQueued}
			order := &model.BillingOrder{ID: "order-" + taskID, UserID: "user-1", IdempotencyKey: "task-request:" + key, TaskID: taskID, AmountMicrocredits: 100, ReservedAmountMicrocredits: 100, Status: model.BillingStatusReserved}
			errorsByAttempt[index] = repo.CreateTaskWithCreditReservation(task, order, 1)
		}(index)
	}
	close(start)
	wg.Wait()

	succeeded, conflicted := 0, 0
	for _, err := range errorsByAttempt {
		switch {
		case err == nil:
			succeeded++
		case errors.Is(err, ErrTaskIdempotencyConflict):
			conflicted++
		default:
			t.Fatalf("unexpected concurrent create error: %v", err)
		}
	}
	if succeeded != 1 || conflicted != attempts-1 {
		t.Fatalf("create results: succeeded=%d conflicted=%d", succeeded, conflicted)
	}
	for label, target := range map[string]any{"tasks": &model.Task{}, "billing orders": &model.BillingOrder{}, "reserve ledgers": &model.CreditLedgerEntry{}} {
		var count int64
		if err := db.Model(target).Count(&count).Error; err != nil {
			t.Fatal(err)
		}
		if count != 1 {
			t.Fatalf("%s count = %d, want 1", label, count)
		}
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user-1").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 900 || account.ReservedMicrocredits != 100 {
		t.Fatalf("account = %#v, want one 100-credit reservation", account)
	}
}

func TestCreateTaskIdempotencyIsScopedByUser(t *testing.T) {
	db, err := gorm.Open(sqlite.Open("file:task-idempotency-users?mode=memory&cache=shared"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.Task{}); err != nil {
		t.Fatal(err)
	}
	repo := New(db)
	key := "shared-client-key-0001"
	for _, userID := range []string{"user-a", "user-b"} {
		task := &model.Task{ID: "task-" + userID, UserID: userID, IdempotencyKey: &key, IdempotencyFingerprint: "same-fingerprint", Status: model.TaskStatusQueued}
		if err := repo.CreateTaskWithActiveLimit(task, 10); err != nil {
			t.Fatalf("create for %s: %v", userID, err)
		}
	}
	var count int64
	if err := db.Model(&model.Task{}).Where("idempotency_key = ?", key).Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("tasks sharing a key across users = %d, want 2", count)
	}
}
