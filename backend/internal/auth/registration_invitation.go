package auth

import (
	"crypto/rand"
	"errors"
	"math/big"
	"regexp"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

var invitationCodePattern = regexp.MustCompile(`^[A-Za-z0-9]{6}$`)

func RandomInvitationCode() (string, error) {
	const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	code := make([]byte, 6)
	for i := range code {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			return "", err
		}
		code[i] = alphabet[n.Int64()]
	}
	return string(code), nil
}

func (s *Service) RegistrationInvitation(code string) (*model.RegistrationInvitation, string, error) {
	if !invitationCodePattern.MatchString(code) {
		return nil, "invalid", nil
	}
	item, err := s.repo.RegistrationInvitationByHash(HashToken(code))
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, "invalid", nil
	}
	if err != nil {
		return nil, "", err
	}
	return item, item.State(time.Now()), nil
}

func (s *Service) requireRegistrationInvitation(code string) (*model.RegistrationInvitation, error) {
	item, state, err := s.RegistrationInvitation(code)
	if err != nil {
		return nil, err
	}
	if state != "valid" {
		return nil, kernel.NewAppError(409, "邀请已失效或已使用，请重新获取邀请")
	}
	return item, nil
}

func (s *Service) registrationAllowed(code string) error {
	if code != "" {
		_, err := s.requireRegistrationInvitation(code)
		return err
	}
	enabled, err := s.RegistrationEnabled()
	if err != nil {
		return err
	}
	if !enabled {
		return kernel.Forbidden("管理员未开放新用户注册")
	}
	return nil
}
