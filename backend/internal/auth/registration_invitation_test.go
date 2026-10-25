package auth

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

type invitationTestHost struct {
	nopHost
	repo *repository.Repository
}

func (h invitationTestHost) SettingsEncryptionKey() ([]byte, error) {
	return []byte("invitation-test-only-key-32-bytes!"), nil
}
func (h invitationTestHost) EnsureSignupBonus(id string) error {
	_, _, err := h.repo.GrantCreditsOnce(id, model.CreditLedgerSignupBonus, 999_000000, "signup:"+id, "global test grant")
	return err
}

func invitationFixture(t *testing.T, amount int64) (*Service, *gorm.DB, *model.RegistrationInvitation, *string) {
	t.Helper()
	svc, db := newRegistrationTestService(t)
	return setupInvitationFixture(t, svc, db, amount)
}

func setupInvitationFixture(t *testing.T, svc *Service, db *gorm.DB, amount int64) (*Service, *gorm.DB, *model.RegistrationInvitation, *string) {
	t.Helper()
	if err := db.AutoMigrate(&model.RegistrationInvitation{}, &model.CreditLedgerEntry{}, &model.AdminAuditEvent{}, &model.AuthVerification{}, &model.NotificationQuota{}); err != nil {
		t.Fatal(err)
	}
	pool, _ := db.DB()
	if db.Dialector.Name() == "sqlite" {
		pool.SetMaxOpenConns(1)
	}
	svc.host = invitationTestHost{repo: repository.New(db)}
	if err := db.Create(&model.User{ID: "admin", Username: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":false}`}).Error; err != nil {
		t.Fatal(err)
	}
	item := &model.RegistrationInvitation{ID: "invite-test", CodeHash: HashToken("Ab3xY9"), CodeEncrypted: "test-only", CreatedByUserID: "admin", BonusMicrocredits: amount, CreatedAt: time.Now(), ExpiresAt: time.Now().Add(7 * 24 * time.Hour)}
	if err := db.Create(item).Error; err != nil {
		t.Fatal(err)
	}
	code := ""
	svc.SetMailSender(func(_ EmailSettingValue, _, _ string, body string) error {
		code = codeFromEmailBody(body)
		if code == "" {
			_, after, _ := strings.Cut(body, "验证码是：")
			code = strings.Split(after, "\n")[0]
		}
		return nil
	})
	return svc, db, item, &code
}

func TestInvitationClosedRegistrationAndGrantSnapshot(t *testing.T) {
	for _, amount := range []int64{0, 50_000000, 123_456789} {
		t.Run(fmt.Sprint(amount), func(t *testing.T) {
			svc, db, _, code := invitationFixture(t, amount)
			if err := svc.SendRegistrationEmailCode("member@example.com"); err == nil {
				t.Fatal("ordinary code send bypassed closed registration")
			}
			if _, err := svc.StartVerification(context.Background(), nil, VerificationRequest{Purpose: "register", Method: "email", Email: "member@example.com"}); err == nil {
				t.Fatal("ordinary ticket bypassed closed registration")
			}
			ticket, err := svc.StartVerification(context.Background(), nil, VerificationRequest{Purpose: "register", Method: "email", Email: "member@example.com", InvitationCode: "Ab3xY9"})
			if err != nil {
				t.Fatal(err)
			}
			req := RegisterRequest{Username: "member", Email: "member@example.com", Ticket: ticket.Ticket, EmailCode: *code, Password: "password-strong", AcceptedTerms: true, InvitationCode: "Ab3xY9"}
			wrong := req
			wrong.Email = "other@example.com"
			if _, err := svc.Register(wrong); err == nil {
				t.Fatal("ticket contact ownership was bypassed")
			}
			result, err := svc.Register(req)
			if err != nil {
				t.Fatal(err)
			}
			if result.User.Role != model.UserRoleUser {
				t.Fatal("invited account is not ordinary user")
			}
			for i := 0; i < 2; i++ {
				if _, err := svc.Login(LoginRequest{Username: "member", Password: req.Password}); err != nil {
					t.Fatal(err)
				}
			}
			account, err := svc.repo.CreditAccount(result.User.ID)
			if err != nil {
				t.Fatal(err)
			}
			if account.AvailableMicrocredits != amount {
				t.Fatalf("amount=%d want snapshot=%d", account.AvailableMicrocredits, amount)
			}
			var count int64
			db.Model(&model.CreditLedgerEntry{}).Where("user_id = ?", result.User.ID).Count(&count)
			if count != 1 {
				t.Fatalf("ledger count=%d", count)
			}
			if _, err := svc.Register(req); err == nil {
				t.Fatal("invitation reused")
			}
			item, state, err := svc.RegistrationInvitation(req.InvitationCode)
			if err != nil || state != "used" || item.UsedByUserID == nil || *item.UsedByUserID != result.User.ID {
				t.Fatalf("invitation state=%s err=%v", state, err)
			}
		})
	}
}

func TestInvitationWithoutVerificationChannelCannotRegister(t *testing.T) {
	svc, db, _, _ := invitationFixture(t, 30_000000)
	if err := svc.repo.SaveSystemSetting(&model.SystemSetting{Key: emailSettingKey, ValueJSON: `{"enabled":false}`, UpdatedBy: "admin"}); err != nil {
		t.Fatal(err)
	}
	settings, err := svc.PublicAuthSettings()
	if err != nil || settings.EmailRegistration || settings.SMSRegistration || settings.SMSAndEmailRegistration {
		t.Fatalf("registration methods available without delivery channel: %#v %v", settings, err)
	}
	if _, err := svc.StartVerification(context.Background(), nil, VerificationRequest{Purpose: "register", Method: "email", Email: "member@example.com", InvitationCode: "Ab3xY9"}); err == nil {
		t.Fatal("verification started without email delivery")
	}
	if _, err := svc.Register(RegisterRequest{Username: "member", Email: "member@example.com", Password: "password-strong", AcceptedTerms: true, InvitationCode: "Ab3xY9"}); err == nil {
		t.Fatal("invitation registration bypassed verification")
	}
	var count int64
	if err := db.Model(&model.User{}).Where("username = ?", "member").Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("failed registration created user: count=%d err=%v", count, err)
	}
	if _, state, err := svc.RegistrationInvitation("Ab3xY9"); err != nil || state != "valid" {
		t.Fatalf("failed registration consumed invitation: state=%s err=%v", state, err)
	}
}

func TestInvitationValidationAndFailureRollback(t *testing.T) {
	svc, db, item, code := invitationFixture(t, 100_000000)
	for _, state := range []string{"expired", "revoked", "used", "invalid"} {
		copy := *item
		value := "other-user"
		now := time.Now()
		switch state {
		case "expired":
			copy.ExpiresAt = now.Add(-time.Minute)
		case "revoked":
			copy.RevokedAt = &now
		case "used":
			copy.UsedAt = &now
			copy.UsedByUserID = &value
		case "invalid":
			copy.CodeHash = HashToken("Other1")
		}
		if err := db.Save(&copy).Error; err != nil {
			t.Fatal(err)
		}
		_, got, err := svc.RegistrationInvitation("Ab3xY9")
		if err != nil || got != state {
			t.Fatalf("state=%s got=%s err=%v", state, got, err)
		}
		if err := svc.SendRegistrationEmailCode("member@example.com", "Ab3xY9"); err == nil {
			t.Fatalf("%s invitation sent code", state)
		}
	}
	if err := db.Save(item).Error; err != nil {
		t.Fatal(err)
	}
	if err := svc.SendRegistrationEmailCode("member@example.com", "Ab3xY9"); err != nil {
		t.Fatal(err)
	}
	req := RegisterRequest{Username: "member", Email: "member@example.com", EmailCode: *code, Password: "password-strong", AcceptedTerms: true, InvitationCode: "Ab3xY9"}
	if err := db.Exec(`CREATE TRIGGER reject_invitation_credit BEFORE INSERT ON credit_ledger_entries BEGIN SELECT RAISE(ABORT, 'injected ledger failure'); END`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Register(req); err == nil {
		t.Fatal("ledger error reported success")
	}
	var count int64
	db.Model(&model.User{}).Where("username = ?", "member").Count(&count)
	if count != 0 {
		t.Fatal("failed registration retained user")
	}
	_, state, err := svc.RegistrationInvitation("Ab3xY9")
	if err != nil || state != "valid" {
		t.Fatalf("failed registration consumed invite: %s %v", state, err)
	}
	if err := db.Exec(`DROP TRIGGER reject_invitation_credit`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Register(req); err != nil {
		t.Fatalf("retry after rollback failed: %v", err)
	}
}

func TestInvitationConcurrentConsumption(t *testing.T) {
	svc, db, _, code := invitationFixture(t, 1)
	requests := make([]RegisterRequest, 2)
	for i := range requests {
		email := fmt.Sprintf("member%d@example.com", i)
		if err := svc.SendRegistrationEmailCode(email, "Ab3xY9"); err != nil {
			t.Fatal(err)
		}
		requests[i] = RegisterRequest{Username: fmt.Sprintf("member%d", i), Email: email, EmailCode: *code, Password: "password-strong", AcceptedTerms: true, InvitationCode: "Ab3xY9"}
	}
	var wg sync.WaitGroup
	successes := make(chan bool, 2)
	for _, req := range requests {
		wg.Add(1)
		go func(req RegisterRequest) {
			defer wg.Done()
			domain := New(repository.New(db), svc.host, svc.mailSender)
			_, err := domain.Register(req)
			successes <- err == nil
		}(req)
	}
	wg.Wait()
	close(successes)
	n := 0
	for success := range successes {
		if success {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("successful consumers=%d", n)
	}
	var count int64
	db.Model(&model.User{}).Where("id <> ?", "admin").Count(&count)
	if count != 1 {
		t.Fatalf("created accounts=%d", count)
	}
	db.Model(&model.CreditLedgerEntry{}).Count(&count)
	if count != 1 {
		t.Fatalf("credit entries=%d", count)
	}
}

func TestInvitationRandomCodeShape(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 100; i++ {
		code, err := RandomInvitationCode()
		if err != nil || !invitationCodePattern.MatchString(code) || seen[code] {
			t.Fatalf("bad generated code at %d", i)
		}
		seen[code] = true
	}
}
