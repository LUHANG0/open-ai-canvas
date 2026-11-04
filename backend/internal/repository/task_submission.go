package repository

import (
	"errors"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"yingce/backend/internal/model"
)

var (
	ErrTaskSubmissionReplayed    = errors.New("task submission already committed")
	ErrTaskSubmissionConflict    = errors.New("同一次提交的内容已变化，请先核对原任务")
	ErrTaskSubmissionUnavailable = errors.New("原任务已不可用，不能重复执行这次提交")
)

func (r *Repository) TaskForSubmission(userID, key, payloadHash string) (*model.Task, error) {
	var receipt model.TaskSubmission
	if err := r.db.First(&receipt, "user_id = ? AND key = ?", userID, key).Error; err != nil {
		return nil, err
	}
	if receipt.PayloadHash != payloadHash {
		return nil, ErrTaskSubmissionConflict
	}
	var task model.Task
	if err := r.db.First(&task, "id = ? AND user_id = ?", receipt.TaskID, userID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrTaskSubmissionUnavailable
		}
		return nil, err
	}
	return &task, nil
}

// Called inside the same transaction, before any debit or task insert. The
// unique (user_id,key) insert serializes even concurrent application instances.
// A failed admission rolls the receipt back together with the reservation.
func (r *Repository) claimTaskSubmission(task *model.Task) error {
	if task.Submission == nil {
		return nil
	}
	receipt := *task.Submission
	receipt.UserID, receipt.TaskID = task.UserID, task.ID
	insert := r.db.Clauses(clause.OnConflict{Columns: []clause.Column{{Name: "user_id"}, {Name: "key"}}, DoNothing: true}).Create(&receipt)
	if insert.Error != nil {
		return insert.Error
	}
	if insert.RowsAffected == 1 {
		return nil
	}
	existing, err := r.TaskForSubmission(task.UserID, receipt.Key, receipt.PayloadHash)
	if err != nil {
		return err
	}
	*task = *existing
	return ErrTaskSubmissionReplayed
}
