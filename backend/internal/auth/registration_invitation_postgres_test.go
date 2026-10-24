package auth

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"yingce/backend/internal/database"
	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// Only a newly created test schema is touched; never reuse the public schema.
func postgresInvitationFixture(t *testing.T, amount int64) (*Service, *gorm.DB, *model.RegistrationInvitation, *string) {
	t.Helper()
	dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}
	options := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)}
	admin, err := gorm.Open(postgres.Open(dsn), options)
	if err != nil {
		t.Fatal(err)
	}
	adminPool, _ := admin.DB()
	t.Cleanup(func() { _ = adminPool.Close() })
	schema := fmt.Sprintf("registration_invitation_test_%d", time.Now().UnixNano())
	if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
			t.Error(err)
		}
	})
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.Open(parsed.String()), options)
	if err != nil {
		t.Fatal(err)
	}
	pool, _ := db.DB()
	pool.SetMaxOpenConns(12)
	t.Cleanup(func() { _ = pool.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	setting, _ := json.Marshal(EmailSettingValue{Enabled: true, Host: "smtp.example.com", Port: 587, Encryption: "starttls", FromEmail: "test@example.com", RegistrationAllowedDomains: []string{"example.com"}})
	if err := db.Create(&model.SystemSetting{Key: emailSettingKey, ValueJSON: string(setting)}).Error; err != nil {
		t.Fatal(err)
	}
	return setupInvitationFixture(t, New(repository.New(db), nil, nil), db, amount)
}

func TestInvitationPostgresConcurrentRegisterAndZeroRecovery(t *testing.T) {
	svc, db, _, code := postgresInvitationFixture(t, 0)
	requests := make([]RegisterRequest, 2)
	for i := range requests {
		email := fmt.Sprintf("pgmember%d@example.com", i)
		if err := svc.SendRegistrationEmailCode(email, "Ab3xY9"); err != nil {
			t.Fatal(err)
		}
		requests[i] = RegisterRequest{Username: fmt.Sprintf("pgmember%d", i), Email: email, EmailCode: *code, Password: "password-strong", AcceptedTerms: true, InvitationCode: "Ab3xY9"}
	}
	start := make(chan struct{})
	results := make(chan *AuthSessionResult, 2)
	failures := make(chan error, 2)
	var wg sync.WaitGroup
	for _, req := range requests {
		wg.Add(1)
		go func(req RegisterRequest) {
			defer wg.Done()
			domain := New(repository.New(db), svc.host, svc.mailSender)
			<-start
			result, err := domain.Register(req)
			if err != nil {
				failures <- err
			} else {
				results <- result
			}
		}(req)
	}
	close(start)
	wg.Wait()
	close(results)
	close(failures)
	if len(results) != 1 || len(failures) != 1 {
		t.Fatalf("success=%d failure=%d", len(results), len(failures))
	}
	for err := range failures {
		var appErr *kernel.AppError
		if !errors.As(err, &appErr) || appErr.Status != 409 {
			t.Fatalf("concurrent loser should be conflict, got %v", err)
		}
	}
	result := <-results
	if _, err := svc.Login(LoginRequest{Username: result.User.Username, Password: "password-strong"}); err != nil {
		t.Fatal(err)
	}
	account, err := svc.repo.CreditAccount(result.User.ID)
	if err != nil || account.AvailableMicrocredits != 0 {
		t.Fatalf("global login bonus overwrote zero: %#v %v", account, err)
	}
	var count int64
	db.Model(&model.User{}).Where("id <> ?", "admin").Count(&count)
	if count != 1 {
		t.Fatalf("created accounts=%d", count)
	}
	db.Model(&model.CreditLedgerEntry{}).Count(&count)
	if count != 1 {
		t.Fatalf("ledger entries=%d", count)
	}
}

func TestInvitationPostgresFailureRollsBackThenRetrySucceeds(t *testing.T) {
	svc, db, _, code := postgresInvitationFixture(t, 123456789)
	if err := svc.SendRegistrationEmailCode("pgmember@example.com", "Ab3xY9"); err != nil {
		t.Fatal(err)
	}
	req := RegisterRequest{Username: "pgmember", Email: "pgmember@example.com", EmailCode: *code, Password: "password-strong", AcceptedTerms: true, InvitationCode: "Ab3xY9"}
	if err := db.Exec(`CREATE FUNCTION reject_invitation_credit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected invitation credit failure'; END; $$`).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`CREATE TRIGGER reject_invitation_credit BEFORE INSERT ON credit_ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_invitation_credit()`).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Register(req); err == nil {
		t.Fatal("injected ledger error returned success")
	}
	var count int64
	db.Model(&model.User{}).Where("username = ?", req.Username).Count(&count)
	if count != 0 {
		t.Fatal("failed registration left user")
	}
	_, state, err := svc.RegistrationInvitation(req.InvitationCode)
	if err != nil || state != "valid" {
		t.Fatalf("rollback invitation state=%s %v", state, err)
	}
	if err := db.Exec(`DROP TRIGGER reject_invitation_credit ON credit_ledger_entries`).Error; err != nil {
		t.Fatal(err)
	}
	result, err := svc.Register(req)
	if err != nil {
		t.Fatal(err)
	}
	if result.SignupBonusMicrocredits == nil || *result.SignupBonusMicrocredits != 123456789 {
		t.Fatal("response did not confirm committed snapshot")
	}
	if _, err := svc.Login(LoginRequest{Username: req.Username, Password: req.Password}); err != nil {
		t.Fatal(err)
	}
	account, err := svc.repo.CreditAccount(result.User.ID)
	if err != nil || account.AvailableMicrocredits != 123456789 {
		t.Fatalf("wrong persisted grant %#v %v", account, err)
	}
}
