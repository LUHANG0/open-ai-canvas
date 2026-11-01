package database

import (
	"testing"
	"yingce/backend/internal/model"
)

func TestTaskSubmissionMigrationIsRepeatableAndUnique(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:" + t.Name() + "?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	receipt := model.TaskSubmission{UserID: "user", Key: "intent-0000000001", PayloadHash: "hash", TaskID: "task"}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&receipt).Error; err == nil {
		t.Fatal("same user/key not unique")
	}
	receipt.UserID = "other"
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	var n int64
	db.Model(&model.TaskSubmission{}).Count(&n)
	if n != 2 {
		t.Fatalf("receipts=%d", n)
	}
}

func TestTaskSubmissionUpgradeFrom61PreservesTasks(t *testing.T) {
	db, err := Open(Config{Driver: "sqlite", DSN: "file:" + t.Name() + "?mode=memory&cache=shared"})
	if err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.Task{ID: "legacy-task", UserID: "user", Status: model.TaskStatusSucceeded, Prompt: "saved before upgrade"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Migrator().DropTable(&model.TaskSubmission{}); err != nil {
		t.Fatal(err)
	}
	if err := db.Where("version = ?", 62).Delete(&schemaMigration{}).Error; err != nil {
		t.Fatal(err)
	}
	if err := MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	var task model.Task
	if err := db.First(&task, "id = ?", "legacy-task").Error; err != nil || task.Prompt != "saved before upgrade" {
		t.Fatalf("legacy task=%v %v", task, err)
	}
	if !db.Migrator().HasTable(&model.TaskSubmission{}) {
		t.Fatal("receipt table not migrated")
	}
}
