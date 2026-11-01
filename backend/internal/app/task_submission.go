package app

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

var taskSubmissionKeyPattern = regexp.MustCompile(`^[A-Za-z0-9._:-]{16,128}$`)

func submissionError(err error) error {
	if errors.Is(err, repository.ErrTaskSubmissionConflict) || errors.Is(err, repository.ErrTaskSubmissionUnavailable) {
		return &AppError{Status: 409, Code: 409, Reason: "task_submission_conflict", Message: err.Error()}
	}
	return err
}

func (s *Service) resolveTaskSubmission(userID, key, namespace string, payload any) (*model.TaskSubmission, *model.Task, error) {
	if key == "" {
		return nil, nil, nil
	} // Older callers remain compatible.
	if !taskSubmissionKeyPattern.MatchString(key) {
		return nil, nil, BadAuthRequest("提交标识格式无效")
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, BadAuthRequest("提交内容无法编码")
	}
	hash := sha256.Sum256(append([]byte(namespace+"\x00"), encoded...))
	receipt := &model.TaskSubmission{UserID: userID, Key: key, PayloadHash: hex.EncodeToString(hash[:])}
	task, err := s.repo.TaskForSubmission(userID, key, receipt.PayloadHash)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return receipt, nil, nil
	}
	if err != nil {
		return nil, nil, submissionError(err)
	}
	return receipt, taskForOutput(*task), nil
}

func (s *Service) CreateTask(userID string, req CreateTaskRequest) (*model.Task, error) {
	// Creation-runtime and Agent admissions already own their transactional
	// identities; a nested public key must not bypass those protocols.
	if req.creationPrepare != nil || req.admission != nil {
		if req.IdempotencyKey != "" {
			return nil, BadAuthRequest("此执行入口使用独立提交标识")
		}
		return s.createTask(userID, req)
	}
	if req.submission == nil {
		submission, existing, err := s.resolveTaskSubmission(userID, req.IdempotencyKey, "task", req)
		if err != nil || existing != nil {
			return existing, err
		}
		req.submission = submission
	} else {
		existing, err := s.repo.TaskForSubmission(userID, req.submission.Key, req.submission.PayloadHash)
		if err == nil {
			return taskForOutput(*existing), nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, submissionError(err)
		}
	}
	task, err := s.createTask(userID, req)
	return s.reconcileTaskSubmission(userID, req.submission, task, err)
}

func (s *Service) reconcileTaskSubmission(userID string, submission *model.TaskSubmission, task *model.Task, err error) (*model.Task, error) {
	if err != nil && submission != nil {
		existing, lookupErr := s.repo.TaskForSubmission(userID, submission.Key, submission.PayloadHash)
		if lookupErr == nil {
			return taskForOutput(*existing), nil
		}
		if !errors.Is(lookupErr, gorm.ErrRecordNotFound) {
			return nil, submissionError(lookupErr)
		}
	}
	return task, submissionError(err)
}
