package service

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

const maxCreationConversationBytes = 2 << 20
const maxCreationConversationMessages = 2000
const maxCreationConversationDeletedMessageIDs = 4000

type CreationConversationRecord struct {
	Conversation json.RawMessage `json:"conversation"`
	Revision     int64           `json:"revision"`
}

type creationConversationPayload struct {
	ID                string   `json:"id"`
	Title             string   `json:"title"`
	UpdatedAt         string   `json:"updatedAt"`
	DeletedMessageIDs []string `json:"deletedMessageIds"`
	Messages          []struct {
		ID        string `json:"id"`
		Role      string `json:"role"`
		Content   string `json:"content"`
		CreatedAt string `json:"createdAt"`
	} `json:"messages"`
}

func (s *Service) CreationConversations(userID string) ([]CreationConversationRecord, error) {
	items, err := s.repo.CreationConversations(userID)
	if err != nil {
		return nil, err
	}
	result := make([]CreationConversationRecord, 0, len(items))
	for _, item := range items {
		result = append(result, CreationConversationRecord{Conversation: json.RawMessage(item.PayloadJSON), Revision: item.Revision})
	}
	return result, nil
}

func (s *Service) UpsertCreationConversation(userID string, raw json.RawMessage, expectedRevision int64) (*CreationConversationRecord, error) {
	parsed, err := validateCreationConversationPayload(raw)
	if err != nil {
		return nil, err
	}
	if expectedRevision < 0 {
		return nil, BadAuthRequest("创作对话版本无效")
	}

	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	existing, existingErr := s.repo.CreationConversationForUser(userID, parsed.ID)
	if existingErr != nil && !errors.Is(existingErr, gorm.ErrRecordNotFound) {
		return nil, existingErr
	}
	if existing != nil && existing.PayloadJSON == string(raw) {
		return &CreationConversationRecord{Conversation: json.RawMessage(existing.PayloadJSON), Revision: existing.Revision}, nil
	}
	if existing == nil && expectedRevision != 0 {
		return nil, NewAppError(http.StatusConflict, "云端对话已被删除或替换，请刷新后重试")
	}
	if existing != nil && existing.Revision != expectedRevision {
		return nil, NewAppError(http.StatusConflict, "该创作对话已在其他页面更新，请合并后重试")
	}
	usage, err := s.repo.UserStorageUsage(userID)
	if err != nil {
		return nil, err
	}
	existingBytes := int64(0)
	if existing != nil {
		existingBytes = int64(len(existing.PayloadJSON))
	}
	policy, err := s.RuntimePolicy()
	if err != nil {
		return nil, err
	}
	if err := validateStructuredStorageQuotaWithPolicy(usage, "creation_conversation", existing == nil, int64(len(raw))-existingBytes, policy.Resource); err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	conversation := model.CreationConversation{ID: parsed.ID, UserID: userID, Title: strings.TrimSpace(parsed.Title), PayloadJSON: string(raw), CreatedAt: now, UpdatedAt: now}
	if err := s.repo.UpsertCreationConversation(&conversation, expectedRevision); errors.Is(err, repository.ErrCreationConversationConflict) {
		return nil, NewAppError(http.StatusConflict, "该创作对话已在其他页面更新，请合并后重试")
	} else if err != nil {
		return nil, err
	}
	return &CreationConversationRecord{Conversation: raw, Revision: conversation.Revision}, nil
}

func (s *Service) DeleteCreationConversation(userID string, id string, expectedRevision int64) error {
	id = strings.TrimSpace(id)
	if id == "" || expectedRevision <= 0 {
		return BadAuthRequest("删除创作对话需要有效的对话 ID 和版本")
	}
	if err := s.repo.DeleteCreationConversation(userID, id, expectedRevision); errors.Is(err, repository.ErrCreationConversationConflict) {
		return NewAppError(http.StatusConflict, "该创作对话已在其他页面更新，请刷新后重试")
	} else {
		return err
	}
}

func validateCreationConversationPayload(raw json.RawMessage) (*creationConversationPayload, error) {
	if len(raw) == 0 || len(raw) > maxCreationConversationBytes {
		return nil, BadAuthRequest("创作对话内容为空或超过 2MB 上限")
	}
	var payload creationConversationPayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return nil, BadAuthRequest("创作对话格式无效")
	}
	var structured any
	if err := json.Unmarshal(raw, &structured); err != nil || containsInlineMediaDataURL(structured) {
		return nil, BadAuthRequest("创作对话不能包含内嵌媒体，请先保存到资源存储")
	}
	payload.ID = strings.TrimSpace(payload.ID)
	payload.Title = strings.TrimSpace(payload.Title)
	if payload.ID == "" || len(payload.ID) > 80 || payload.Title == "" || len([]rune(payload.Title)) > 240 {
		return nil, BadAuthRequest("创作对话标识或标题无效")
	}
	if _, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(payload.UpdatedAt)); err != nil {
		return nil, BadAuthRequest("创作对话更新时间无效")
	}
	if len(payload.Messages) > maxCreationConversationMessages {
		return nil, BadAuthRequest("单个创作对话不能超过 2000 条消息")
	}
	if len(payload.DeletedMessageIDs) > maxCreationConversationDeletedMessageIDs {
		return nil, BadAuthRequest("单个创作对话的消息删除记录不能超过 4000 条")
	}
	deletedMessageIDs := make(map[string]struct{}, len(payload.DeletedMessageIDs))
	for _, rawID := range payload.DeletedMessageIDs {
		id := strings.TrimSpace(rawID)
		if id == "" || len(id) > 80 {
			return nil, BadAuthRequest("创作对话包含无效的消息删除记录")
		}
		if _, duplicate := deletedMessageIDs[id]; duplicate {
			return nil, BadAuthRequest("创作对话包含重复的消息删除记录")
		}
		deletedMessageIDs[id] = struct{}{}
	}
	messageIDs := make(map[string]struct{}, len(payload.Messages))
	for _, message := range payload.Messages {
		id := strings.TrimSpace(message.ID)
		if id == "" || len(id) > 80 || (message.Role != "user" && message.Role != "assistant") {
			return nil, BadAuthRequest("创作对话包含无效消息")
		}
		if _, duplicate := messageIDs[id]; duplicate {
			return nil, BadAuthRequest("创作对话包含重复消息")
		}
		if _, deleted := deletedMessageIDs[id]; deleted {
			return nil, BadAuthRequest("创作对话不能同时保留并删除同一条消息")
		}
		messageIDs[id] = struct{}{}
		if _, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(message.CreatedAt)); err != nil {
			return nil, BadAuthRequest("创作消息时间无效")
		}
	}
	return &payload, nil
}
