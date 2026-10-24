package app

import (
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode/utf8"

	"gorm.io/gorm"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type CreateRegistrationInvitationRequest struct {
	Note              string `json:"note"`
	BonusMicrocredits *int64 `json:"bonusMicrocredits"`
	ExpiresInDays     int    `json:"expiresInDays"`
}

type AdminRegistrationInvitation struct {
	model.RegistrationInvitation
	Code           string `json:"code"`
	State          string `json:"state"`
	UsedByUsername string `json:"usedByUsername,omitempty"`
}

type PublicRegistrationInvitation struct {
	State             string              `json:"state"`
	BonusMicrocredits *int64              `json:"bonusMicrocredits,omitempty"`
	Settings          *PublicAuthSettings `json:"settings,omitempty"`
}

func invitationAudit(actor *model.User, action, id, summary string, metadata any) (*model.AdminAuditEvent, error) {
	encoded, err := json.Marshal(metadata)
	if err != nil {
		return nil, err
	}
	return &model.AdminAuditEvent{ID: kernel.NewID(), ActorUserID: actor.ID, Action: action, TargetType: "registration_invitation", TargetID: id, Summary: summary, MetadataJSON: string(encoded), CreatedAt: time.Now()}, nil
}

func (s *Service) requireInvitationAdmin(actor *model.User) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	current, err := s.repo.User(actor.ID)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return Unauthorized("请先登录")
	}
	if err != nil {
		return err
	}
	if current.Status != model.UserStatusActive {
		return Forbidden("该账号已被禁用")
	}
	return s.RequireAdmin(current)
}

func (s *Service) invitationView(item *model.RegistrationInvitation) (*AdminRegistrationInvitation, error) {
	code, err := s.decryptSettingSecret(item.CodeEncrypted)
	if err != nil {
		return nil, err
	}
	view := &AdminRegistrationInvitation{RegistrationInvitation: *item, Code: code, State: item.State(time.Now())}
	if item.UsedByUserID != nil {
		user, err := s.repo.User(*item.UsedByUserID)
		if err != nil {
			return nil, err
		}
		view.UsedByUsername = user.Username
	}
	return view, nil
}

func (s *Service) CreateRegistrationInvitation(actor *model.User, req CreateRegistrationInvitationRequest) (*AdminRegistrationInvitation, error) {
	if err := s.requireInvitationAdmin(actor); err != nil {
		return nil, err
	}
	if req.BonusMicrocredits == nil || *req.BonusMicrocredits < 0 || *req.BonusMicrocredits > 1_000_000*CreditScale {
		return nil, BadAuthRequest("请填写 0–1,000,000 积分的注册赠送金额，最多 6 位小数")
	}
	if req.ExpiresInDays == 0 {
		req.ExpiresInDays = 7
	}
	if req.ExpiresInDays < 1 || req.ExpiresInDays > 90 {
		return nil, BadAuthRequest("邀请有效期须为 1–90 天")
	}
	req.Note = strings.TrimSpace(req.Note)
	if utf8.RuneCountInString(req.Note) > 200 {
		return nil, BadAuthRequest("备注最多 200 字")
	}
	now := time.Now()
	for attempt := 0; attempt < 8; attempt++ {
		code, err := auth.RandomInvitationCode()
		if err != nil {
			return nil, err
		}
		encrypted, err := s.encryptSettingSecret(code)
		if err != nil {
			return nil, err
		}
		item := &model.RegistrationInvitation{ID: kernel.NewID(), CodeHash: auth.HashToken(code), CodeEncrypted: encrypted, CreatedByUserID: actor.ID, Note: req.Note, BonusMicrocredits: *req.BonusMicrocredits, CreatedAt: now, ExpiresAt: now.Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour)}
		audit, err := invitationAudit(actor, "registration_invitation.create", item.ID, "创建用户注册邀请", map[string]any{"bonusMicrocredits": item.BonusMicrocredits, "expiresAt": item.ExpiresAt})
		if err != nil {
			return nil, err
		}
		if err := s.repo.CreateRegistrationInvitation(item, audit); errors.Is(err, repository.ErrInvitationCollision) {
			continue
		} else if err != nil {
			return nil, err
		}
		return s.invitationView(item)
	}
	return nil, kernel.NewAppError(503, "暂时无法生成邀请，请重试")
}

func (s *Service) ListRegistrationInvitations(actor *model.User, page, pageSize int) ([]AdminRegistrationInvitation, int64, error) {
	if err := s.requireInvitationAdmin(actor); err != nil {
		return nil, 0, err
	}
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	items, total, err := s.repo.RegistrationInvitations(pageSize, (page-1)*pageSize)
	if err != nil {
		return nil, 0, err
	}
	views := make([]AdminRegistrationInvitation, 0, len(items))
	for _, item := range items {
		view, err := s.invitationView(&item)
		if err != nil {
			return nil, 0, err
		}
		views = append(views, *view)
	}
	return views, total, nil
}

func (s *Service) RevokeRegistrationInvitation(actor *model.User, id string) error {
	if err := s.requireInvitationAdmin(actor); err != nil {
		return err
	}
	audit, err := invitationAudit(actor, "registration_invitation.revoke", id, "撤销用户注册邀请", nil)
	if err != nil {
		return err
	}
	err = s.repo.RevokeRegistrationInvitation(id, time.Now(), audit)
	if errors.Is(err, repository.ErrInvitationUnavailable) {
		return kernel.NewAppError(409, "邀请状态已变化，请刷新记录")
	}
	return err
}

func (s *Service) ValidateRegistrationInvitation(code string) (*PublicRegistrationInvitation, error) {
	item, state, err := s.authDomain().RegistrationInvitation(code)
	if err != nil {
		return nil, err
	}
	result := &PublicRegistrationInvitation{State: state}
	if state != "valid" {
		return result, nil
	}
	settings, err := s.PublicAuthSettings()
	if err != nil {
		return nil, err
	}
	settings.FirstUser, settings.RegistrationEnabled, settings.LinuxDOEnabled = false, true, false
	result.Settings, result.BonusMicrocredits = settings, &item.BonusMicrocredits
	return result, nil
}
