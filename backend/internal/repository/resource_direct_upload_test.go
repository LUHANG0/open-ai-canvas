package repository

import (
	"fmt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"
	"yingce/backend/internal/model"
)

func TestDirectUploadPostgresCompletionRace(t *testing.T) {
	dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("set CANVAS_TEST_POSTGRES_DSN to an isolated test database")
	}
	admin, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("direct_upload_%d", time.Now().UnixNano())
	if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { admin.Exec("DROP SCHEMA " + schema + " CASCADE"); conn, _ := admin.DB(); conn.Close() })
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.Open(parsed.String()), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	conn, _ := db.DB()
	t.Cleanup(func() { conn.Close() })
	if err := db.AutoMigrate(&model.Resource{}, &model.UploadReservation{}, &model.UserDailyUploadUsage{}); err != nil {
		t.Fatal(err)
	}
	repo := New(db)
	before := model.Resource{ID: "direct", UserID: "user", Status: model.ResourceStatusPending, ObjectKey: "owned", Size: 12, Error: "direct-upload:digest", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := repo.ReserveUploadSession(&model.UploadReservation{ID: before.ID, UserID: "user", Size: 12, ExpiresAt: time.Now().Add(time.Hour)}, 1000, 1000, 32); err != nil {
		t.Fatal(err)
	}
	if err := repo.CreateResource(&before); err != nil {
		t.Fatal(err)
	}
	// Read timestamps back at the database's precision before comparing revisions.
	row, err := repo.ResourceForUser("user", "direct")
	if err != nil {
		t.Fatal(err)
	}
	before = *row
	start := make(chan struct{})
	results := make(chan error, 8)
	changed := make(chan bool, 8)
	var workers sync.WaitGroup
	for i := 0; i < 8; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			ready := before
			ready.Status = model.ResourceStatusReady
			ready.Error = ""
			_, ok, err := New(db.Session(&gorm.Session{NewDB: true})).CompleteDirectUpload(&before, &ready, 1000, 1000)
			results <- err
			changed <- ok
		}()
	}
	close(start)
	workers.Wait()
	close(results)
	close(changed)
	for err := range results {
		if err != nil {
			t.Fatal(err)
		}
	}
	n := 0
	for ok := range changed {
		if ok {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("published %d times", n)
	}
	if used, _ := repo.DailyUploadBytes("user", time.Now().UTC().Format("2006-01-02")); used != 12 {
		t.Fatalf("quota charged %d", used)
	}
}

func TestDirectUploadCompletionDoesNotResurrectOrDoubleCharge(t *testing.T) {
	db, repo, peer := uploadReservationTestDB(t)
	before := model.Resource{ID: "direct", UserID: "user", Status: model.ResourceStatusPending, ObjectKey: "owned", Size: 12, Error: "direct-upload:digest", CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := repo.ReserveUploadSession(&model.UploadReservation{ID: before.ID, UserID: before.UserID, Size: before.Size, ExpiresAt: time.Now().Add(time.Hour)}, 1000, 1000, 32); err != nil {
		t.Fatal(err)
	}
	if err := repo.CreateResource(&before); err != nil {
		t.Fatal(err)
	}
	ready := before
	ready.Status = model.ResourceStatusReady
	ready.Error = ""
	if _, changed, err := repo.CompleteDirectUpload(&before, &ready, 1000, 1000); err != nil || !changed {
		t.Fatalf("complete: changed=%v err=%v", changed, err)
	}
	if _, changed, err := peer.CompleteDirectUpload(&before, &ready, 1000, 1000); err != nil || changed {
		t.Fatalf("duplicate: changed=%v err=%v", changed, err)
	}
	if used, _ := repo.DailyUploadBytes("user", time.Now().UTC().Format("2006-01-02")); used != 12 {
		t.Fatalf("quota charged %d", used)
	}
	if err := db.Delete(&ready).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := repo.CompleteDirectUpload(&before, &ready, 1000, 1000); err == nil {
		t.Fatal("deleted row resurrected")
	}
	var count int64
	db.Model(&model.Resource{}).Count(&count)
	if count != 0 {
		t.Fatal("deleted row restored")
	}
}

func TestDirectUploadExpiredGrantRetirementIsAtomic(t *testing.T) {
	db, repo, _ := uploadReservationTestDB(t)
	if err := db.AutoMigrate(&model.ResourceDeletionJob{}); err != nil {
		t.Fatal(err)
	}
	before := model.Resource{ID: "expired", UserID: "user", Status: model.ResourceStatusPending, ObjectKey: "old-object", Size: 12, Error: "direct-upload:digest", CreatedAt: time.Now().Add(-time.Hour), UpdatedAt: time.Now()}
	if err := repo.ReserveUploadSession(&model.UploadReservation{ID: before.ID, UserID: "user", Size: 12, ExpiresAt: time.Now().Add(time.Hour)}, 1000, 1000, 32); err != nil {
		t.Fatal(err)
	}
	if err := repo.CreateResource(&before); err != nil {
		t.Fatal(err)
	}
	job := model.ResourceDeletionJob{ID: "cleanup", UserID: "user", ResourceID: before.ID, ObjectKey: before.ObjectKey, Status: model.ResourceDeletionStatusPending, NextAttemptAt: time.Now().Add(time.Hour)}
	if err := repo.RetireDirectUpload(&before, &job); err != nil {
		t.Fatal(err)
	}
	if used, _ := repo.DailyUploadBytes("user", time.Now().UTC().Format("2006-01-02")); used != 0 {
		t.Fatalf("reservation leaked %d", used)
	}
	var jobs int64
	db.Model(&model.ResourceDeletionJob{}).Count(&jobs)
	if jobs != 1 {
		t.Fatal("outbox missing")
	}
	ready := before
	ready.Status = model.ResourceStatusReady
	if _, _, err := repo.CompleteDirectUpload(&before, &ready, 1000, 1000); err == nil {
		t.Fatal("expired old grant resurrected")
	}
}
