package service

import (
	"encoding/base64"
	"strings"
	"sync"
	"testing"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestRegistrationInviteLifecycleAndInviteOnlySignup(t *testing.T) {
	svc, db, admin := newRegistrationInviteTestService(t)
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 7, CreditAmountMicrocredits: 50 * CreditScale, Note: "新成员"})
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := base64.RawURLEncoding.DecodeString(created.Token)
	if err != nil || len(decoded) != 32 {
		t.Fatalf("token is not 32-byte base64url: length=%d error=%v", len(decoded), err)
	}
	var stored model.RegistrationInvite
	if err := db.First(&stored, "id = ?", created.Invite.ID).Error; err != nil {
		t.Fatal(err)
	}
	if stored.TokenHash == created.Token || strings.Contains(stored.TokenHash, created.Token) || len(stored.TokenHash) != 64 {
		t.Fatalf("raw token persisted: %#v", stored)
	}
	if stored.CreditAmountMicrocredits != 50*CreditScale || created.Invite.CreditAmountMicrocredits != 50*CreditScale {
		t.Fatalf("invite credit amount was not persisted: stored=%d view=%d", stored.CreditAmountMicrocredits, created.Invite.CreditAmountMicrocredits)
	}
	publicInvite, err := svc.ExchangeRegistrationInvite(created.Token)
	if err != nil || publicInvite.CreditAmountMicrocredits != 50*CreditScale {
		t.Fatalf("public invite credit amount=%d error=%v", publicInvite.CreditAmountMicrocredits, err)
	}
	var audit model.AdminAuditEvent
	if err := db.First(&audit, "action = ?", "registration_invite.create").Error; err != nil {
		t.Fatal(err)
	}
	if strings.Contains(audit.MetadataJSON, created.Token) {
		t.Fatal("raw token leaked into audit metadata")
	}

	if _, err := svc.Register(RegisterRequest{Username: "public-user", Email: "public@example.com", Password: "password-123"}); err == nil {
		t.Fatal("ordinary public registration succeeded while registration is closed")
	}
	result, clearInvite, err := svc.RegisterWithInvitation(RegisterRequest{Username: "invited-user", DisplayName: "受邀用户", Password: "password-123"}, created.Token)
	if err != nil {
		t.Fatal(err)
	}
	if !clearInvite || result.User.Role != model.UserRoleUser || result.User.Email != "" || result.Session == "" {
		t.Fatalf("unexpected invited signup result: %#v clear=%v", result, clearInvite)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", result.User.ID).Error; err != nil || account.AvailableMicrocredits != 50*CreditScale {
		t.Fatalf("signup bonus missing: %#v error=%v", account, err)
	}
	var ledger model.CreditLedgerEntry
	if err := db.First(&ledger, "user_id = ? AND type = ?", result.User.ID, model.CreditLedgerSignupBonus).Error; err != nil || ledger.AmountMicrocredits != 50*CreditScale || ledger.Note != "邀请注册积分" {
		t.Fatalf("invite credit ledger mismatch: %#v error=%v", ledger, err)
	}
	used, err := svc.AdminRegistrationInvites(admin, "used", 1, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(used.Invites) != 1 || used.Invites[0].UsedBy == nil || used.Invites[0].UsedBy.ID != result.User.ID {
		t.Fatalf("used invite does not reference created user: %#v", used)
	}
	if _, clear, err := svc.RegisterWithInvitation(RegisterRequest{Username: "second-user", Password: "password-123"}, created.Token); err == nil || !clear || !strings.Contains(err.Error(), "已使用") {
		t.Fatalf("reused invite result: clear=%v error=%v", clear, err)
	}
}

func TestRegistrationInviteFailedSignupDoesNotConsume(t *testing.T) {
	svc, db, admin := newRegistrationInviteTestService(t)
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 3})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec("CREATE TRIGGER fail_invited_user BEFORE INSERT ON users WHEN NEW.username = 'forced-failure' BEGIN SELECT RAISE(ABORT, 'forced user failure'); END;").Error; err != nil {
		t.Fatal(err)
	}
	if _, clear, err := svc.RegisterWithInvitation(RegisterRequest{Username: "forced-failure", Password: "password-123"}, created.Token); err == nil || clear {
		t.Fatalf("forced failure result: clear=%v error=%v", clear, err)
	}
	var invite model.RegistrationInvite
	if err := db.First(&invite, "id = ?", created.Invite.ID).Error; err != nil {
		t.Fatal(err)
	}
	if invite.UsedAt != nil || invite.UsedBy != nil {
		t.Fatalf("failed signup consumed invite: %#v", invite)
	}
}

func TestRegistrationInviteConcurrentUseSucceedsOnce(t *testing.T) {
	svc, db, admin := newRegistrationInviteTestService(t)
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 1})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, username := range []string{"parallel-one", "parallel-two"} {
		username := username
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _, registerErr := svc.RegisterWithInvitation(RegisterRequest{Username: username, Password: "password-123"}, created.Token)
			results <- registerErr
		}()
	}
	wg.Wait()
	close(results)
	successes := 0
	for resultErr := range results {
		if resultErr == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatalf("concurrent successes = %d, want 1", successes)
	}
	var createdUsers int64
	if err := db.Model(&model.User{}).Where("username LIKE ?", "parallel-%").Count(&createdUsers).Error; err != nil {
		t.Fatal(err)
	}
	if createdUsers != 1 {
		t.Fatalf("concurrent created users = %d, want 1", createdUsers)
	}
}

func TestRegistrationInviteStatusesPermissionsAndRevocationAudit(t *testing.T) {
	svc, db, admin := newRegistrationInviteTestService(t)
	nonAdmin := &model.User{ID: "user-1", Username: "member", Role: model.UserRoleUser, Status: model.UserStatusActive}
	if err := db.Create(nonAdmin).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.CreateRegistrationInvite(nonAdmin, CreateRegistrationInviteRequest{ExpiresInDays: 7}); err == nil {
		t.Fatal("non-admin created invite")
	}
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 7})
	if err != nil {
		t.Fatal(err)
	}
	if created.Invite.CreditAmountMicrocredits != 100*CreditScale {
		t.Fatalf("default invite credits=%d, want %d", created.Invite.CreditAmountMicrocredits, 100*CreditScale)
	}
	if _, err := svc.RevokeRegistrationInvite(nonAdmin, created.Invite.ID); err == nil {
		t.Fatal("non-admin revoked invite")
	}
	revoked, err := svc.RevokeRegistrationInvite(admin, created.Invite.ID)
	if err != nil || revoked.Status != RegistrationInviteRevoked {
		t.Fatalf("revoke result=%#v error=%v", revoked, err)
	}
	state, err := svc.ExchangeRegistrationInvite(created.Token)
	if err != nil || state.Status != RegistrationInviteRevoked || state.ExpiresAt != nil {
		t.Fatalf("revoked exchange=%#v error=%v", state, err)
	}
	invalid, err := svc.ExchangeRegistrationInvite("not-a-valid-token")
	if err != nil || invalid.Status != RegistrationInviteInvalid {
		t.Fatalf("invalid exchange=%#v error=%v", invalid, err)
	}
	var auditCount int64
	if err := db.Model(&model.AdminAuditEvent{}).Where("action IN ?", []string{"registration_invite.create", "registration_invite.revoke"}).Count(&auditCount).Error; err != nil {
		t.Fatal(err)
	}
	if auditCount != 2 {
		t.Fatalf("invite audit count = %d, want 2", auditCount)
	}

	expired, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 1})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Model(&model.RegistrationInvite{}).Where("id = ?", expired.Invite.ID).Update("expires_at", time.Now().Add(-time.Minute)).Error; err != nil {
		t.Fatal(err)
	}
	expiredState, err := svc.ExchangeRegistrationInvite(expired.Token)
	if err != nil || expiredState.Status != RegistrationInviteExpired {
		t.Fatalf("expired exchange=%#v error=%v", expiredState, err)
	}
}

func TestRegistrationInviteRejectsInvalidCreditAmounts(t *testing.T) {
	svc, _, admin := newRegistrationInviteTestService(t)
	for _, amount := range []int64{-CreditScale, CreditScale - 1, 50*CreditScale + 1, 1_000_001 * CreditScale} {
		if _, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 7, CreditAmountMicrocredits: amount}); err == nil || !strings.Contains(err.Error(), "邀请积分") {
			t.Fatalf("credit amount %d was accepted: %v", amount, err)
		}
	}
}

func newRegistrationInviteTestService(t *testing.T) (*Service, *gorm.DB, *model.User) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open("file:"+newID()+"?mode=memory&cache=shared&_busy_timeout=5000&_foreign_keys=on"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.AutoMigrate(&model.User{}, &model.AuthSession{}, &model.RegistrationInvite{}, &model.AdminAuditEvent{}, &model.SystemSetting{}, &model.CreditAccount{}, &model.CreditLedgerEntry{}); err != nil {
		t.Fatal(err)
	}
	admin := &model.User{ID: "admin-1", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, CreatedAt: time.Now(), UpdatedAt: time.Now()}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	closed := model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":false}`, UpdatedBy: admin.ID}
	if err := db.Create(&closed).Error; err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), t.TempDir()), db, admin
}
