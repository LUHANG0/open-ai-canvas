package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
	"yingce/backend/internal/auth"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

type turnstileTransport func(*http.Request) (*http.Response, error)

func (f turnstileTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func turnstileStatus(t *testing.T, err error, want int) {
	t.Helper()
	var appErr *kernel.AppError
	if !errors.As(err, &appErr) || appErr.Status != want {
		t.Fatalf("error = %v, want status %d", err, want)
	}
}
func turnstileTestSetting() TurnstileSettingRequest {
	v := defaultTurnstileSetting()
	v.Enabled = true
	v.SiteKey = "sitekey_for_turnstile_test"
	v.SecretKey = "secret_for_turnstile_test"
	v.Hostnames = []string{"mengceng.com"}
	return v
}
func TestTurnstileVerifyBindsHostnameActionAndFailsClosed(t *testing.T) {
	v := turnstileTestSetting()
	calls := 0
	svc := &Service{turnstileClient: &http.Client{Transport: turnstileTransport(func(r *http.Request) (*http.Response, error) {
		calls++
		if r.URL.String() != "https://challenges.cloudflare.com/turnstile/v0/siteverify" || r.Method != "POST" {
			t.Fatal("unexpected endpoint")
		}
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		if r.Form.Get("secret") != v.SecretKey || r.Form.Get("response") == "" || r.Form.Get("remoteip") != "192.0.2.1" {
			t.Fatal("missing validation parameters")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"success":true,"hostname":"mengceng.com","action":"register"}`)), Header: http.Header{}}, nil
	})}}
	turnstileStatus(t, svc.verifyTurnstile(context.Background(), v, "register", "", "192.0.2.1"), 403)
	turnstileStatus(t, svc.verifyTurnstile(context.Background(), v, "register", strings.Repeat("x", 2049), "192.0.2.1"), 403)
	if calls != 0 {
		t.Fatal("invalid token reached upstream")
	}
	if err := svc.verifyTurnstile(context.Background(), v, "register", "fresh-token", "192.0.2.1"); err != nil {
		t.Fatal(err)
	}
	for _, row := range []struct {
		name, body   string
		status, want int
	}{
		{"cross action", `{"success":true,"hostname":"mengceng.com","action":"login"}`, 200, 403},
		{"cross host", `{"success":true,"hostname":"attacker.example","action":"register"}`, 200, 403},
		{"expired or reused", `{"success":false,"error-codes":["timeout-or-duplicate"]}`, 200, 403},
		{"malformed", `not-json`, 200, 503}, {"unavailable", `{}`, 503, 503}, {"redirect", `{}`, 302, 503},
	} {
		t.Run(row.name, func(t *testing.T) {
			svc.turnstileClient.Transport = turnstileTransport(func(*http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: row.status, Body: io.NopCloser(strings.NewReader(row.body)), Header: http.Header{"Location": []string{"https://attacker.example"}}}, nil
			})
			turnstileStatus(t, svc.verifyTurnstile(context.Background(), v, "register", "token", "192.0.2.1"), row.want)
		})
	}
	svc.turnstileClient.Transport = turnstileTransport(func(*http.Request) (*http.Response, error) { return nil, errors.New("private upstream detail") })
	err := svc.verifyTurnstile(context.Background(), v, "register", "token", "192.0.2.1")
	turnstileStatus(t, err, 503)
	if strings.Contains(err.Error(), "private") || strings.Contains(err.Error(), v.SecretKey) {
		t.Fatal("upstream details leaked")
	}
}
func TestTurnstileSettingsEncryptPreserveSecretAndRejectStaleEdits(t *testing.T) {
	svc, db, _, admin := newAppearanceTestService(t)
	t.Cleanup(func() { _ = svc.Close() })
	req := turnstileTestSetting()
	result, err := svc.UpdateTurnstileSetting(admin, req)
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasSecretKey || result.Revision != 1 {
		t.Fatal("missing saved status")
	}
	stored, err := svc.repo.SystemSettingOptional(turnstileSettingKey)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(stored.ValueJSON, req.SecretKey) {
		t.Fatal("secret persisted unencrypted")
	}
	encoded, _ := json.Marshal(result)
	if strings.Contains(string(encoded), req.SecretKey) || strings.Contains(string(encoded), `"secretKey"`) {
		t.Fatal("secret exposed")
	}
	turnstileStatus(t, func() error { _, e := svc.UpdateTurnstileSetting(admin, req); return e }(), 409)
	req.Revision = result.Revision
	req.SecretKey = ""
	req.LoginFailureThreshold = 4
	if _, err = svc.UpdateTurnstileSetting(admin, req); err != nil {
		t.Fatal(err)
	}
	_, value, err := svc.readTurnstileSetting()
	if err != nil || value.SecretKey != "secret_for_turnstile_test" {
		t.Fatal("blank secret was not preserved")
	}
	user := &model.User{ID: "not-admin", Role: model.UserRoleUser, Status: model.UserStatusActive}
	_, err = svc.AdminTurnstileSetting(user)
	turnstileStatus(t, err, 403)
	req.Revision = 2
	req.Hostnames = []string{"https://mengceng.com"}
	_, err = svc.UpdateTurnstileSetting(admin, req)
	turnstileStatus(t, err, 400)
	req.Hostnames = []string{"mengceng.com"}
	req.SiteKey = "1x00000000000000000000AA"
	_, err = svc.UpdateTurnstileSetting(admin, req)
	turnstileStatus(t, err, 400)
	var count int64
	db.Model(&model.SystemSetting{}).Where("key = ?", turnstileSettingKey).Count(&count)
	if count != 1 {
		t.Fatal("duplicate setting")
	}
}
func TestTurnstileProgressivePasswordLoginSharesAccountAndResetsOnSuccess(t *testing.T) {
	svc, db, _, admin := newAppearanceTestService(t)
	t.Cleanup(func() { _ = svc.Close() })
	if _, err := svc.UpdateTurnstileSetting(admin, turnstileTestSetting()); err != nil {
		t.Fatal(err)
	}
	hash, _ := bcrypt.GenerateFromPassword([]byte("correct-password"), bcrypt.MinCost)
	user := &model.User{ID: "turnstile-user", Username: "creator", Email: "creator@example.com", Role: model.UserRoleUser, Status: model.UserStatusActive, PasswordHash: string(hash)}
	if err := db.Create(user).Error; err != nil {
		t.Fatal(err)
	}
	req := LoginRequest{Username: "creator", Password: "wrong-password", LoginContext: auth.LoginContext{IP: "192.0.2.8"}}
	for i := 1; i <= 3; i++ {
		if i == 2 {
			req.Username = "creator@example.com"
		} else {
			req.Username = "creator"
		}
		_, err := svc.LoginWithHumanVerification(context.Background(), req, "")
		turnstileStatus(t, err, 401)
		var e *kernel.AppError
		_ = errors.As(err, &e)
		if (e.Details != nil) != (i == 3) {
			t.Fatalf("challenge trigger on attempt %d: %v", i, e.Details)
		}
	}
	req.Password = "correct-password"
	_, err := svc.LoginWithHumanVerification(context.Background(), req, "")
	turnstileStatus(t, err, 403)
	var sessions int64
	db.Model(&model.AuthSession{}).Where("user_id = ?", user.ID).Count(&sessions)
	if sessions != 0 {
		t.Fatal("login bypassed challenge")
	}
	svc.turnstileClient = &http.Client{Transport: turnstileTransport(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"success":true,"hostname":"mengceng.com","action":"login"}`))}, nil
	})}
	if _, err = svc.LoginWithHumanVerification(context.Background(), req, "fresh-token"); err != nil {
		t.Fatal(err)
	}
	// The account window is cleared only after a successful authenticated login.
	if _, err = svc.LoginWithHumanVerification(context.Background(), req, ""); err != nil {
		t.Fatal(err)
	}
}

func TestTurnstilePasswordSprayRequiresChallengeAcrossAccounts(t *testing.T) {
	svc, _, _, admin := newAppearanceTestService(t)
	t.Cleanup(func() { _ = svc.Close() })
	if _, err := svc.UpdateTurnstileSetting(admin, turnstileTestSetting()); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 9; i++ {
		req := LoginRequest{Username: fmt.Sprintf("unknown-%d", i), Password: "incorrect", LoginContext: auth.LoginContext{IP: "192.0.2.20"}}
		_, err := svc.LoginWithHumanVerification(context.Background(), req, "")
		turnstileStatus(t, err, 401)
	}
	_, err := svc.LoginWithHumanVerification(context.Background(), LoginRequest{Username: "another-account", Password: "incorrect", LoginContext: auth.LoginContext{IP: "192.0.2.20"}}, "")
	turnstileStatus(t, err, 403)
	// A different source is not locked out by the other source's failures.
	_, err = svc.LoginWithHumanVerification(context.Background(), LoginRequest{Username: "another-account", Password: "incorrect", LoginContext: auth.LoginContext{IP: "192.0.2.21"}}, "")
	turnstileStatus(t, err, 401)
}
