package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"yingce/backend/internal/auth"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
	"yingce/backend/internal/outbound"
)

const turnstileSettingKey = "turnstile"

type TurnstileSettingRequest struct {
	Revision              int64    `json:"revision"`
	Enabled               bool     `json:"enabled"`
	SiteKey               string   `json:"siteKey"`
	SecretKey             string   `json:"secretKey"`
	Hostnames             []string `json:"hostnames"`
	Registration          bool     `json:"registration"`
	PasswordReset         bool     `json:"passwordReset"`
	CodeLogin             bool     `json:"codeLogin"`
	PasswordLogin         bool     `json:"passwordLogin"`
	LoginFailureThreshold int      `json:"loginFailureThreshold"`
}

type PublicTurnstileSetting struct {
	Revision              int64    `json:"revision"`
	Enabled               bool     `json:"enabled"`
	SiteKey               string   `json:"siteKey"`
	HasSecretKey          bool     `json:"hasSecretKey"`
	Hostnames             []string `json:"hostnames"`
	Registration          bool     `json:"registration"`
	PasswordReset         bool     `json:"passwordReset"`
	CodeLogin             bool     `json:"codeLogin"`
	PasswordLogin         bool     `json:"passwordLogin"`
	LoginFailureThreshold int      `json:"loginFailureThreshold"`
}

func defaultTurnstileSetting() TurnstileSettingRequest {
	return TurnstileSettingRequest{Hostnames: []string{}, Registration: true, PasswordReset: true, CodeLogin: true, PasswordLogin: true, LoginFailureThreshold: 3}
}

func (s *Service) readTurnstileSetting() (*model.SystemSetting, TurnstileSettingRequest, error) {
	value := defaultTurnstileSetting()
	setting, err := s.repo.SystemSettingOptional(turnstileSettingKey)
	if err != nil || setting == nil {
		return setting, value, err
	}
	if json.Unmarshal([]byte(setting.ValueJSON), &value) != nil {
		return nil, value, kernel.NewAppError(503, "人机验证配置无效，请联系管理员")
	}
	value.SecretKey, err = s.decryptSettingSecret(value.SecretKey)
	if err != nil {
		return nil, value, kernel.NewAppError(503, "人机验证配置不可用，请联系管理员")
	}
	return setting, value, nil
}

func publicTurnstileSetting(value TurnstileSettingRequest) *PublicTurnstileSetting {
	return &PublicTurnstileSetting{Revision: value.Revision, Enabled: value.Enabled, SiteKey: value.SiteKey, HasSecretKey: value.SecretKey != "", Hostnames: value.Hostnames, Registration: value.Registration, PasswordReset: value.PasswordReset, CodeLogin: value.CodeLogin, PasswordLogin: value.PasswordLogin, LoginFailureThreshold: value.LoginFailureThreshold}
}

func (s *Service) AdminTurnstileSetting(actor *model.User) (*PublicTurnstileSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	_, value, err := s.readTurnstileSetting()
	if err != nil {
		return nil, err
	}
	return publicTurnstileSetting(value), nil
}

var turnstileKeyPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]{10,100}$`)
var turnstileHostnamePattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$`)

func (s *Service) UpdateTurnstileSetting(actor *model.User, req TurnstileSettingRequest) (*PublicTurnstileSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	previous, current, err := s.readTurnstileSetting()
	if err != nil {
		return nil, err
	}
	if req.Revision != current.Revision {
		return nil, kernel.NewAppError(409, "人机验证配置已更新，请重新读取后再保存")
	}
	req.SiteKey = strings.TrimSpace(req.SiteKey)
	req.SecretKey = strings.TrimSpace(req.SecretKey)
	if req.SecretKey == "" {
		req.SecretKey = current.SecretKey
	}
	if len(req.Hostnames) > 20 || req.LoginFailureThreshold < 1 || req.LoginFailureThreshold > 10 {
		return nil, kernel.BadAuthRequest("允许域名最多 20 项，登录失败触发次数需为 1 到 10")
	}
	seen := map[string]bool{}
	hosts := []string{}
	for _, hostname := range req.Hostnames {
		hostname = strings.TrimSuffix(strings.ToLower(strings.TrimSpace(hostname)), ".")
		if len(hostname) > 253 || !turnstileHostnamePattern.MatchString(hostname) {
			return nil, kernel.BadAuthRequest("请填写完整主机名，不包含协议、路径、端口或通配符")
		}
		if !seen[hostname] {
			hosts = append(hosts, hostname)
			seen[hostname] = true
		}
	}
	req.Hostnames = hosts
	if req.Enabled && (!turnstileKeyPattern.MatchString(req.SiteKey) || !turnstileKeyPattern.MatchString(req.SecretKey) || len(hosts) == 0) {
		return nil, kernel.BadAuthRequest("启用前请填写有效的 Site Key、Secret Key 和允许域名")
	}
	// Cloudflare test credentials must never accidentally protect a public site.
	if req.Enabled && (strings.HasPrefix(req.SiteKey, "1x000000") || strings.HasPrefix(req.SiteKey, "2x000000") || strings.HasPrefix(req.SiteKey, "3x000000")) {
		for _, host := range hosts {
			if host != "localhost" && host != "127.0.0.1" {
				return nil, kernel.BadAuthRequest("测试密钥仅可用于本机域名")
			}
		}
	}
	req.Revision++
	stored := req
	stored.SecretKey, err = s.encryptSettingSecret(req.SecretKey)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(stored)
	if err != nil {
		return nil, err
	}
	next := &model.SystemSetting{Key: turnstileSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	saved, err := s.repo.CompareAndSwapSystemSetting(next, previous)
	if err != nil {
		return nil, err
	}
	if !saved {
		return nil, kernel.NewAppError(409, "人机验证配置已更新，请重新读取后再保存")
	}
	return publicTurnstileSetting(req), nil
}

func turnstileRequired(message, action string) *kernel.AppError {
	err := kernel.Forbidden(message)
	err.Details = map[string]any{"humanVerificationRequired": true, "action": action}
	return err
}

func turnstileUnavailable(message, action string) *kernel.AppError {
	err := kernel.NewAppError(503, message)
	err.Details = map[string]any{"humanVerificationRequired": true, "action": action}
	return err
}

func (s *Service) verifyTurnstile(ctx context.Context, value TurnstileSettingRequest, action, token, ip string) error {
	if token == "" {
		return turnstileRequired("请先完成人机验证", action)
	}
	if len(token) > 2048 {
		return turnstileRequired("验证凭证无效，请重新验证", action)
	}
	if value.SecretKey == "" || value.SiteKey == "" || len(value.Hostnames) == 0 {
		return turnstileUnavailable("人机验证配置不完整，请联系管理员", action)
	}
	values := url.Values{"secret": {value.SecretKey}, "response": {token}}
	if ip != "" {
		values.Set("remoteip", ip)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://challenges.cloudflare.com/turnstile/v0/siteverify", strings.NewReader(values.Encode()))
	if err != nil {
		return turnstileUnavailable("人机验证暂不可用，请稍后重试", action)
	}
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	client := s.turnstileClient
	if client == nil {
		client = outbound.OutboundHTTPClient(8 * time.Second)
	}
	copyClient := *client
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	response, err := copyClient.Do(request)
	if err != nil {
		return turnstileUnavailable("人机验证暂不可用，请重试，已填写内容会保留", action)
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return turnstileUnavailable("人机验证暂不可用，请稍后重试", action)
	}
	var result struct {
		Success  bool   `json:"success"`
		Hostname string `json:"hostname"`
		Action   string `json:"action"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 16<<10)).Decode(&result); err != nil {
		return turnstileUnavailable("人机验证响应无效，请重试", action)
	}
	hostname := strings.TrimSuffix(strings.ToLower(result.Hostname), ".")
	allowed := false
	for _, host := range value.Hostnames {
		if hostname == host {
			allowed = true
			break
		}
	}
	if !result.Success || !allowed || result.Action != action {
		return turnstileRequired("验证未通过或已过期，请重新验证", action)
	}
	return nil
}

// CheckHumanVerification is called before notification creation and delivery on
// every public notification endpoint, including legacy registration/recovery.
func (s *Service) CheckHumanVerification(ctx context.Context, action, token, ip string) error {
	_, value, err := s.readTurnstileSetting()
	if err != nil {
		return err
	}
	if !value.Enabled {
		return nil
	}
	protect := (action == "register" && value.Registration) || (action == "password_reset" && value.PasswordReset) || (action == "code_login" && value.CodeLogin)
	if !protect {
		return nil
	}
	return s.verifyTurnstile(ctx, value, action, token, ip)
}

func (s *Service) LoginWithHumanVerification(ctx context.Context, req LoginRequest, token string) (session *AuthSessionResult, resultErr error) {
	delegated := false
	defer func() {
		if !delegated && resultErr != nil {
			status := 503
			var appErr *kernel.AppError
			if errors.As(resultErr, &appErr) {
				status = appErr.Status
			}
			if err := s.RecordRejectedLogin("password", req.LoginContext, status); err != nil {
				log.Printf("turnstile rejected login audit write failed: %v", err)
			}
		}
	}()
	_, value, err := s.readTurnstileSetting()
	if err != nil {
		return nil, err
	}
	if !value.Enabled || !value.PasswordLogin {
		delegated = true
		return s.Login(req)
	}
	if s.coordinator == nil {
		return nil, kernel.NewAppError(503, "登录安全检查暂不可用")
	}
	subject, err := s.LoginRateLimitSubject(req.Username)
	if err != nil {
		return nil, err
	}
	ipKey := auth.HashToken("ip:" + req.LoginContext.IP)
	accountKey := auth.HashToken("account:" + req.LoginContext.IP + ":" + subject)
	count, err := s.coordinator.AuthFailures(ctx, accountKey, "read")
	if err != nil {
		return nil, kernel.NewAppError(503, "登录安全检查暂不可用")
	}
	ipCount, err := s.coordinator.AuthFailures(ctx, ipKey, "read")
	if err != nil {
		return nil, kernel.NewAppError(503, "登录安全检查暂不可用")
	}
	if count >= value.LoginFailureThreshold || ipCount >= value.LoginFailureThreshold*3 {
		if err := s.verifyTurnstile(ctx, value, "login", token, req.LoginContext.IP); err != nil {
			return nil, err
		}
	}
	delegated = true
	result, loginErr := s.Login(req)
	if loginErr == nil {
		// A reset failure must not turn a completed login into an ambiguous failure.
		_, _ = s.coordinator.AuthFailures(ctx, accountKey, "clear")
		return result, nil
	}
	var appErr *kernel.AppError
	if !errors.As(loginErr, &appErr) || (appErr.Status != 401 && appErr.Status != 403) {
		return nil, loginErr
	}
	count, err = s.coordinator.AuthFailures(ctx, accountKey, "add")
	if err != nil {
		return nil, kernel.NewAppError(503, "登录安全检查暂不可用")
	}
	ipCount, err = s.coordinator.AuthFailures(ctx, ipKey, "add")
	if err != nil {
		return nil, kernel.NewAppError(503, "登录安全检查暂不可用")
	}
	if count >= value.LoginFailureThreshold || ipCount >= value.LoginFailureThreshold*3 {
		copyError := *appErr
		copyError.Details = map[string]any{"humanVerificationRequired": true, "action": "login"}
		return nil, &copyError
	}
	return nil, loginErr
}
