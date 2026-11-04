package model

import "time"

// TaskSubmission is the durable receipt for one authenticated client intent.
// It commits with the task and its credit reservation, and is not expired on
// task completion: an old transport replay must never become a new paid task.
type TaskSubmission struct {
	UserID      string `gorm:"primaryKey;not null;size:36"`
	Key         string `gorm:"primaryKey;not null;size:128"`
	PayloadHash string `gorm:"not null;size:64"`
	TaskID      string `gorm:"not null;size:36;index"`
	CreatedAt   time.Time
}
