package service

import (
	"crypto/rand"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

const RegistrationInviteCookieName = "open_ai_canvas_registration_invite"

const registrationInviteCookieMaxAge = 15 * time.Minute

type RegistrationInviteStatus string

const (
	RegistrationInvitePending RegistrationInviteStatus = "pending"
	RegistrationInviteUsed    RegistrationInviteStatus = "used"
	RegistrationInviteExpired RegistrationInviteStatus = "expired"
	RegistrationInviteRevoked RegistrationInviteStatus = "revoked"
	RegistrationInviteInvalid RegistrationInviteStatus = "invalid"
)

type CreateRegistrationInviteRequest struct {
	ExpiresInDays int    `json:"expiresInDays"`
	Note          string `json:"note"`
}

type RegistrationInviteUser struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

type RegistrationInviteView struct {
	ID        string                   `json:"id"`
	Note      string                   `json:"note,omitempty"`
	Status    RegistrationInviteStatus `json:"status"`
	ExpiresAt time.Time                `json:"expiresAt"`
	UsedAt    *time.Time               `json:"usedAt,omitempty"`
	UsedBy    *RegistrationInviteUser  `json:"usedBy,omitempty"`
	RevokedAt *time.Time               `json:"revokedAt,omitempty"`
	CreatedAt time.Time                `json:"createdAt"`
}

type CreatedRegistrationInvite struct {
	Invite RegistrationInviteView `json:"invite"`
	Token  string                 `json:"token"`
}

type RegistrationInvitePage struct {
	Invites []RegistrationInviteView `json:"invites"`
	Total   int64                    `json:"total"`
	Page    int                      `json:"page"`
	Limit   int                      `json:"limit"`
}

type PublicRegistrationInvite struct {
	Status    RegistrationInviteStatus `json:"status"`
	ExpiresAt *time.Time               `json:"expiresAt,omitempty"`
}

func (s *Service) CreateRegistrationInvite(actor *model.User, req CreateRegistrationInviteRequest) (*CreatedRegistrationInvite, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if req.ExpiresInDays != 1 && req.ExpiresInDays != 3 && req.ExpiresInDays != 7 {
		return nil, BadAuthRequest("邀请有效期只支持 1 天、3 天或 7 天")
	}
	note := strings.TrimSpace(req.Note)
	if len([]rune(note)) > 500 {
		return nil, BadAuthRequest("邀请备注不能超过 500 个字符")
	}
	token, err := newRegistrationInviteToken()
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	invite := model.RegistrationInvite{
		ID:        newID(),
		TokenHash: hashToken(token),
		CreatedBy: actor.ID,
		Note:      note,
		ExpiresAt: now.Add(time.Duration(req.ExpiresInDays) * 24 * time.Hour),
		CreatedAt: now,
		UpdatedAt: now,
	}
	audit, err := newAdminAuditEvent(actor, "registration_invite.create", "registration_invite", invite.ID, "创建用户注册邀请", map[string]any{"expiresAt": invite.ExpiresAt, "expiresInDays": req.ExpiresInDays, "hasNote": note != ""})
	if err != nil {
		return nil, err
	}
	if err := s.repo.CreateRegistrationInvite(&invite, audit); err != nil {
		return nil, err
	}
	return &CreatedRegistrationInvite{Invite: registrationInviteView(invite, now), Token: token}, nil
}

func (s *Service) AdminRegistrationInvites(actor *model.User, status string, page int, limit int) (*RegistrationInvitePage, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	status = strings.TrimSpace(strings.ToLower(status))
	if status != "" && status != "all" && status != string(RegistrationInvitePending) && status != string(RegistrationInviteUsed) && status != string(RegistrationInviteExpired) && status != string(RegistrationInviteRevoked) {
		return nil, BadAuthRequest("邀请状态筛选无效")
	}
	if status == "all" {
		status = ""
	}
	page, limit = normalizeAdminPage(page, limit)
	now := time.Now().UTC()
	invites, total, err := s.repo.RegistrationInvites(status, now, limit, (page-1)*limit)
	if err != nil {
		return nil, err
	}
	views := make([]RegistrationInviteView, 0, len(invites))
	for _, invite := range invites {
		views = append(views, registrationInviteView(invite, now))
	}
	return &RegistrationInvitePage{Invites: views, Total: total, Page: page, Limit: limit}, nil
}

func (s *Service) RevokeRegistrationInvite(actor *model.User, id string) (*RegistrationInviteView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return nil, BadAuthRequest("邀请 ID 不能为空")
	}
	now := time.Now().UTC()
	audit, err := newAdminAuditEvent(actor, "registration_invite.revoke", "registration_invite", id, "撤销用户注册邀请", nil)
	if err != nil {
		return nil, err
	}
	if err := s.repo.RevokeRegistrationInvite(id, now, audit); err != nil {
		if errors.Is(err, repository.ErrRegistrationInviteUnavailable) {
			return nil, BadAuthRequest("只有待使用且未过期的邀请可以撤销")
		}
		return nil, err
	}
	invite, err := s.repo.RegistrationInvite(id)
	if err != nil {
		return nil, err
	}
	view := registrationInviteView(*invite, now)
	return &view, nil
}

func (s *Service) ExchangeRegistrationInvite(token string) (*PublicRegistrationInvite, error) {
	invite, status, err := s.resolveRegistrationInvite(token, time.Now().UTC())
	if err != nil {
		return nil, err
	}
	result := &PublicRegistrationInvite{Status: status}
	if invite != nil && status == RegistrationInvitePending {
		result.ExpiresAt = &invite.ExpiresAt
	}
	return result, nil
}

func (s *Service) resolveRegistrationInvite(token string, now time.Time) (*model.RegistrationInvite, RegistrationInviteStatus, error) {
	trimmed := strings.TrimSpace(token)
	decoded, decodeErr := base64.RawURLEncoding.DecodeString(trimmed)
	tokenHash := hashToken(trimmed)
	invite, err := s.repo.RegistrationInviteByTokenHash(tokenHash)
	if errors.Is(err, gorm.ErrRecordNotFound) || decodeErr != nil || len(decoded) != 32 {
		return nil, RegistrationInviteInvalid, nil
	}
	if err != nil {
		return nil, "", err
	}
	return invite, registrationInviteStatus(*invite, now), nil
}

func registrationInviteStatus(invite model.RegistrationInvite, now time.Time) RegistrationInviteStatus {
	if invite.UsedAt != nil {
		return RegistrationInviteUsed
	}
	if invite.RevokedAt != nil {
		return RegistrationInviteRevoked
	}
	if !invite.ExpiresAt.After(now) {
		return RegistrationInviteExpired
	}
	return RegistrationInvitePending
}

func registrationInviteView(invite model.RegistrationInvite, now time.Time) RegistrationInviteView {
	view := RegistrationInviteView{
		ID:        invite.ID,
		Note:      invite.Note,
		Status:    registrationInviteStatus(invite, now),
		ExpiresAt: invite.ExpiresAt,
		UsedAt:    invite.UsedAt,
		RevokedAt: invite.RevokedAt,
		CreatedAt: invite.CreatedAt,
	}
	if invite.UsedByUser != nil {
		view.UsedBy = &RegistrationInviteUser{ID: invite.UsedByUser.ID, Username: invite.UsedByUser.Username, DisplayName: invite.UsedByUser.DisplayName}
	}
	return view
}

func newRegistrationInviteToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(bytes), nil
}

func RegistrationInviteCookieMaxAgeSeconds() int {
	return int(registrationInviteCookieMaxAge.Seconds())
}

func (s *Service) registerInvitedUser(req RegisterRequest, inviteToken string) (*AuthSessionResult, bool, error) {
	now := time.Now().UTC()
	invite, status, err := s.resolveRegistrationInvite(inviteToken, now)
	if err != nil {
		return nil, false, err
	}
	if status != RegistrationInvitePending || invite == nil {
		return nil, true, registrationInviteStatusError(status)
	}

	username := normalizeUsername(req.Username)
	email := normalizeEmail(req.Email)
	displayName := normalizeDisplayName(req.DisplayName, username)
	if err := validateUsername(username); err != nil {
		return nil, false, err
	}
	if err := validatePassword(req.Password); err != nil {
		return nil, false, err
	}
	if email != "" {
		if err := validateEmail(email); err != nil {
			return nil, false, err
		}
	}

	s.registrationMu.Lock()
	defer s.registrationMu.Unlock()
	if _, err := s.repo.UserByUsername(username); err == nil {
		return nil, false, BadAuthRequest("用户名已存在")
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, false, err
	}
	if email != "" {
		if _, err := s.repo.UserByEmail(email); err == nil {
			return nil, false, BadAuthRequest("邮箱已被注册")
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, false, err
		}
	}
	passwordHash, err := hashPassword(req.Password)
	if err != nil {
		return nil, false, err
	}
	signupBonus, err := s.signupBonusForInvitedUser()
	if err != nil {
		return nil, false, err
	}
	now = time.Now().UTC()
	user := model.User{
		ID:           newID(),
		Username:     username,
		Email:        email,
		DisplayName:  displayName,
		Role:         model.UserRoleUser,
		Status:       model.UserStatusActive,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	sessionToken := randomToken()
	session := model.AuthSession{
		ID:        newID(),
		UserID:    user.ID,
		TokenHash: hashToken(sessionToken),
		ExpiresAt: now.Add(sessionMaxAge),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.repo.ConsumeRegistrationInvite(invite.ID, hashToken(strings.TrimSpace(inviteToken)), now, &user, &session, signupBonus); err != nil {
		if errors.Is(err, repository.ErrRegistrationInviteUnavailable) {
			_, latestStatus, resolveErr := s.resolveRegistrationInvite(inviteToken, time.Now().UTC())
			if resolveErr != nil {
				return nil, true, resolveErr
			}
			return nil, true, registrationInviteStatusError(latestStatus)
		}
		if isRegistrationUniqueConstraintError(err) {
			return nil, false, BadAuthRequest("用户名或邮箱已被注册")
		}
		return nil, false, err
	}
	return &AuthSessionResult{
		User:       AuthUser{User: user},
		Session:    session.ID + "." + sessionToken,
		MaxAgeSecs: int(sessionMaxAge.Seconds()),
	}, true, nil
}

func (s *Service) signupBonusForInvitedUser() (int64, error) {
	enabled, err := s.FeatureEnabled(FeatureCredits)
	if err != nil || !enabled {
		return 0, err
	}
	policy, err := s.creditPolicy()
	if err != nil {
		return 0, err
	}
	return policy.SignupBonusMicrocredits, nil
}

func registrationInviteStatusError(status RegistrationInviteStatus) error {
	switch status {
	case RegistrationInviteExpired:
		return Forbidden("邀请已过期")
	case RegistrationInviteUsed:
		return Forbidden("邀请已使用")
	case RegistrationInviteRevoked:
		return Forbidden("邀请已撤销")
	default:
		return Forbidden("邀请无效")
	}
}

func isRegistrationUniqueConstraintError(err error) bool {
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "unique constraint") || strings.Contains(message, "duplicate key")
}
