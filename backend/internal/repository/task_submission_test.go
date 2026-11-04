package repository

import (
	"errors"
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

func TestTaskSubmissionAcrossConnections(t *testing.T) {
	for _, driver := range []string{"sqlite", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			config := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)}
			var dialector gorm.Dialector = sqlite.Open(filepath.Join(t.TempDir(), "submission.db") + "?_journal_mode=WAL&_busy_timeout=5000")
			if driver == "postgres" {
				dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("set CANVAS_TEST_POSTGRES_DSN to isolated database")
				}
				admin, err := gorm.Open(postgres.Open(dsn), config)
				if err != nil {
					t.Fatal(err)
				}
				schema := fmt.Sprintf("task_submission_%d", time.Now().UnixNano())
				if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
					t.Fatal(err)
				}
				t.Cleanup(func() {
					if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
						t.Error(err)
					}
					c, _ := admin.DB()
					_ = c.Close()
				})
				parsed, err := url.Parse(dsn)
				if err != nil {
					t.Fatal(err)
				}
				q := parsed.Query()
				q.Set("search_path", schema)
				parsed.RawQuery = q.Encode()
				dialector = postgres.Open(parsed.String())
			}
			open := func() *gorm.DB {
				db, err := gorm.Open(dialector, config)
				if err != nil {
					t.Fatal(err)
				}
				c, _ := db.DB()
				t.Cleanup(func() { _ = c.Close() })
				return db
			}
			db := open()
			if err := database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
			if err := database.MigrateSchema(db); err != nil {
				t.Fatal(err)
			}
			if err := db.Create(&model.CreditAccount{UserID: "user", AvailableMicrocredits: 1000}).Error; err != nil {
				t.Fatal(err)
			}
			repos := []*Repository{New(db), New(open())}
			hash := strings.Repeat("a", 64)
			ids := make(chan string, 12)
			errs := make(chan error, 12)
			var wg sync.WaitGroup
			for i := range 12 {
				wg.Add(1)
				go func(i int) {
					defer wg.Done()
					id := fmt.Sprintf("candidate-%d", i)
					order := &model.BillingOrder{ID: "order-" + id, TaskID: id, UserID: "user", IdempotencyKey: "task:" + id, AmountMicrocredits: 100, BillingMode: "fixed_request"}
					task := &model.Task{ID: id, UserID: "user", Type: "canvas_image", Status: model.TaskStatusQueued, BillingOrderID: order.ID, Submission: &model.TaskSubmission{Key: "same-client-intent", PayloadHash: hash}}
					err := repos[i%2].CreateTaskWithCreditReservation(task, order, 100)
					if err != nil && !errors.Is(err, ErrTaskSubmissionReplayed) {
						errs <- err
						return
					}
					ids <- task.ID
				}(i)
			}
			wg.Wait()
			close(ids)
			close(errs)
			for err := range errs {
				t.Error(err)
			}
			first := ""
			for id := range ids {
				if first == "" {
					first = id
				}
				if id != first {
					t.Errorf("duplicate task=%s original=%s", id, first)
				}
			}
			for _, m := range []any{&model.Task{}, &model.BillingOrder{}, &model.TaskSubmission{}, &model.CreditLedgerEntry{}} {
				var n int64
				if err := db.Model(m).Count(&n).Error; err != nil || n != 1 {
					t.Fatalf("%T count=%d err=%v", m, n, err)
				}
			}
			var account model.CreditAccount
			db.First(&account, "user_id = ?", "user")
			if account.AvailableMicrocredits != 900 || account.ReservedMicrocredits != 100 {
				t.Fatalf("balance=%+v", account)
			}
			reopened := New(open())
			receipt, err := reopened.TaskForSubmission("user", "same-client-intent", hash)
			if err != nil || receipt.ID != first {
				t.Fatalf("reopen receipt=%v %v", receipt, err)
			}
			if _, err := reopened.TaskForSubmission("user", "same-client-intent", "different"); !errors.Is(err, ErrTaskSubmissionConflict) {
				t.Fatalf("changed hash=%v", err)
			}
			// Admission failure rolls back both the receipt and the order.
			denied := &model.Task{ID: "denied", UserID: "user", Status: model.TaskStatusQueued, Submission: &model.TaskSubmission{Key: "failed-intent", PayloadHash: hash}}
			order := &model.BillingOrder{ID: "denied-order", TaskID: denied.ID, UserID: "user", IdempotencyKey: "task:denied", AmountMicrocredits: 10000, BillingMode: "fixed_request"}
			if err := reopened.CreateTaskWithCreditReservation(denied, order, 100); !errors.Is(err, ErrInsufficientCredits) {
				t.Fatalf("denied=%v", err)
			}
			if _, err := reopened.TaskForSubmission("user", "failed-intent", hash); !errors.Is(err, gorm.ErrRecordNotFound) {
				t.Fatalf("failed admission retained receipt: %v", err)
			}
			// Free tasks use the same durable uniqueness boundary.
			free := &model.Task{ID: "free", UserID: "user", Status: model.TaskStatusQueued, Submission: &model.TaskSubmission{Key: "free-intent", PayloadHash: hash}}
			if err := reopened.CreateTaskWithActiveLimit(free, 100); err != nil {
				t.Fatal(err)
			}
			replay := &model.Task{ID: "free-again", UserID: "user", Status: model.TaskStatusQueued, Submission: &model.TaskSubmission{Key: "free-intent", PayloadHash: hash}}
			if err := reopened.CreateTaskWithActiveLimit(replay, 100); !errors.Is(err, ErrTaskSubmissionReplayed) || replay.ID != "free" {
				t.Fatalf("free replay=%v %v", replay, err)
			}
		})
	}
}
