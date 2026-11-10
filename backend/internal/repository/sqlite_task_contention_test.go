package repository

import (
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/mattn/go-sqlite3"
	"gorm.io/gorm"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
)

// Use the application's connection settings, a real WAL file and a second
// connection: shared in-memory fixtures do not reproduce WAL snapshot upgrades.
func TestSQLiteTaskReadWriteContention(t *testing.T) {
	for _, connection := range []string{"default", "dsn"} {
		for _, operation := range []string{"paid-admission", "free-admission", "retry", "claim"} {
			t.Run(connection+"/"+operation, func(t *testing.T) {
				config := database.Config{DataDir: t.TempDir()}
				if connection == "dsn" {
					config.DSN = filepath.Join(config.DataDir, "open_ai_canvas.db") + "?_journal_mode=WAL&_busy_timeout=5000"
				}
				db, err := database.Open(config)
				if err != nil {
					t.Fatal(err)
				}
				if err := database.ConfigurePool(db); err != nil {
					t.Fatal(err)
				}
				conn, _ := db.DB()
				t.Cleanup(func() { _ = conn.Close() })
				if err := db.AutoMigrate(&model.Task{}, &model.TaskTextDelta{}, &model.TaskSubmission{}, &model.CreditAccount{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}); err != nil {
					t.Fatal(err)
				}
				if err := db.Create(&model.CreditAccount{UserID: "user", AvailableMicrocredits: 1000}).Error; err != nil {
					t.Fatal(err)
				}
				// Explicit DSN opens another pool against the same application database.
				other, err := database.Open(database.Config{DSN: filepath.Join(config.DataDir, "open_ai_canvas.db") + "?_journal_mode=WAL&_busy_timeout=5000"})
				if err != nil {
					t.Fatal(err)
				}
				otherConn, _ := other.DB()
				t.Cleanup(func() { _ = otherConn.Close() })
				task := &model.Task{ID: "task", UserID: "user", Type: "canvas_image", Status: model.TaskStatusQueued}
				if operation == "retry" || operation == "claim" {
					if operation == "retry" {
						task.Status = model.TaskStatusFailed
					}
					if err := db.Create(task).Error; err != nil {
						t.Fatal(err)
					}
				}
				writerDone := make(chan error, 1)
				var once sync.Once
				var writerErr error
				writerFinished := false
				if err := db.Callback().Query().After("gorm:query").Register("test:interleave-writer", func(tx *gorm.DB) {
					if tx.Statement.Table != "tasks" || tx.Error != nil {
						return
					}
					once.Do(func() {
						go func() {
							writerDone <- other.Exec("UPDATE credit_accounts SET version = version + 1 WHERE user_id = ?", "user").Error
						}()
						// Deferred BEGIN lets this writer commit, invalidating the read
						// snapshot. Immediate BEGIN holds it until the first commit.
						select {
						case writerErr = <-writerDone:
							writerFinished = true
						case <-time.After(200 * time.Millisecond):
						}
					})
				}); err != nil {
					t.Fatal(err)
				}
				repo := New(db)
				order := &model.BillingOrder{ID: "order", TaskID: task.ID, UserID: "user", IdempotencyKey: "task:task", AmountMicrocredits: 100, BillingMode: "fixed_request"}
				switch operation {
				case "paid-admission":
					task.BillingOrderID = order.ID
					err = repo.CreateTaskWithCreditReservation(task, order, 10)
				case "free-admission":
					err = repo.CreateTaskWithActiveLimit(task, 10)
				case "retry":
					_, err = repo.RetryTaskWithBilling("user", task, order, 10)
				case "claim":
					var claimed *model.Task
					claimed, err = repo.ClaimNextTask("worker", time.Minute)
					if err == nil && (claimed == nil || claimed.ID != task.ID || claimed.LeaseOwner != "worker" || claimed.Attempts != 1) {
						t.Errorf("unexpected claim: %+v", claimed)
					}
				}
				if !writerFinished {
					select {
					case writerErr = <-writerDone:
					case <-time.After(6 * time.Second):
						t.Fatal("competing writer did not finish")
					}
				}
				if writerErr != nil {
					t.Errorf("competing writer: %v", writerErr)
				}
				if err != nil {
					if se, ok := err.(sqlite3.Error); ok {
						t.Logf("sqlite code=%d extended=%d", se.Code, se.ExtendedCode)
					}
					t.Fatalf("%s failed after concurrent write: %v", operation, err)
				}
				var count int64
				if err := db.Model(&model.Task{}).Count(&count).Error; err != nil || count != 1 {
					t.Fatalf("tasks=%d err=%v", count, err)
				}
				paid := operation == "paid-admission" || operation == "retry"
				var expected int64
				if paid {
					expected = 1
				}
				for _, m := range []any{&model.BillingOrder{}, &model.CreditLedgerEntry{}} {
					if err := db.Model(m).Count(&count).Error; err != nil || count != expected {
						t.Errorf("%T count=%d expected=%d err=%v", m, count, expected, err)
					}
				}
				var account model.CreditAccount
				if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
					t.Fatal(err)
				}
				if account.AvailableMicrocredits != 1000-100*expected || account.ReservedMicrocredits != 100*expected || account.Version != 1+expected {
					t.Fatalf("unexpected account: %+v", account)
				}
			})
		}
	}
}

func TestSQLiteConcurrentTaskAdmissionsAndClaims(t *testing.T) {
	config := database.Config{DataDir: t.TempDir()}
	open := func() *gorm.DB {
		db, err := database.Open(config)
		if err != nil {
			t.Fatal(err)
		}
		if err := database.ConfigurePool(db); err != nil {
			t.Fatal(err)
		}
		conn, _ := db.DB()
		t.Cleanup(func() { _ = conn.Close() })
		return db
	}
	db := open()
	if err := db.AutoMigrate(&model.Task{}, &model.TaskSubmission{}, &model.CreditAccount{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditAccount{UserID: "user", AvailableMicrocredits: 10000}).Error; err != nil {
		t.Fatal(err)
	}
	repos := []*Repository{New(db), New(open())}
	const intents = 12
	start := make(chan struct{})
	admissionsDone := make(chan struct{})
	claimsDone := make(chan struct{})
	errs := make(chan error, intents*2+1)
	claimedIDs := make(map[string]bool)
	go func() {
		defer close(claimsDone)
		<-start
		ticker := time.NewTicker(time.Millisecond)
		defer ticker.Stop()
		finished := false
		for {
			task, err := repos[1].ClaimNextTask("worker", time.Minute)
			if err != nil {
				errs <- err
				return
			}
			if task != nil {
				if claimedIDs[task.ID] || task.LeaseOwner != "worker" || task.Attempts != 1 {
					errs <- fmt.Errorf("invalid or duplicate claim: %+v", task)
					return
				}
				claimedIDs[task.ID] = true
				continue
			}
			if finished {
				return
			}
			select {
			case <-admissionsDone:
				finished = true
			case <-ticker.C:
			}
		}
	}()
	var wg sync.WaitGroup
	for i := range intents * 2 {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			id := fmt.Sprintf("task-%d", i)
			order := &model.BillingOrder{ID: "order-" + id, TaskID: id, UserID: "user", IdempotencyKey: "task:" + id, AmountMicrocredits: 100, BillingMode: "fixed_request"}
			task := &model.Task{ID: id, UserID: "user", Type: "canvas_image", Status: model.TaskStatusQueued, BillingOrderID: order.ID, Submission: &model.TaskSubmission{Key: fmt.Sprintf("intent-%d", i%intents), PayloadHash: "same-payload"}}
			if err := repos[i%2].CreateTaskWithCreditReservation(task, order, 100); err != nil && !errors.Is(err, ErrTaskSubmissionReplayed) {
				errs <- err
			}
		}(i)
	}
	close(start)
	wg.Wait()
	close(admissionsDone)
	<-claimsDone
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	if len(claimedIDs) != intents {
		t.Errorf("claimed %d tasks, expected %d", len(claimedIDs), intents)
	}
	for _, m := range []any{&model.Task{}, &model.TaskSubmission{}, &model.BillingOrder{}, &model.CreditLedgerEntry{}} {
		var count int64
		if err := db.Model(m).Count(&count).Error; err != nil || count != intents {
			t.Errorf("%T count=%d err=%v", m, count, err)
		}
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", "user").Error; err != nil {
		t.Fatal(err)
	}
	if account.AvailableMicrocredits != 8800 || account.ReservedMicrocredits != 1200 || account.Version != intents {
		t.Fatalf("duplicate or missing reservation: %+v", account)
	}
}
