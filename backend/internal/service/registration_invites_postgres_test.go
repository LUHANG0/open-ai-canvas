package service

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"infinite-canvas/backend/internal/database"
	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

func TestPostgresRegistrationInviteCreatesExactCreditsAtomically(t *testing.T) {
	svc, db, admin := newPostgresRegistrationInviteTestService(t, "invite_atomic")
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 7, CreditAmountMicrocredits: 275 * CreditScale})
	if err != nil {
		t.Fatal(err)
	}
	result, clearInvite, err := svc.RegisterWithInvitation(RegisterRequest{Username: "postgres-invited", DisplayName: "Postgres 受邀用户", Password: "password-123"}, created.Token)
	if err != nil {
		t.Fatal(err)
	}
	if !clearInvite || result.User.Role != model.UserRoleUser || result.Session == "" {
		t.Fatalf("unexpected invited signup result: %#v clear=%v", result, clearInvite)
	}

	var invite model.RegistrationInvite
	if err := db.First(&invite, "id = ?", created.Invite.ID).Error; err != nil {
		t.Fatal(err)
	}
	if invite.UsedAt == nil || invite.UsedBy == nil || *invite.UsedBy != result.User.ID || invite.CreditAmountMicrocredits != 275*CreditScale {
		t.Fatalf("postgres invite was not claimed with exact credits: %#v", invite)
	}
	var account model.CreditAccount
	if err := db.First(&account, "user_id = ?", result.User.ID).Error; err != nil || account.AvailableMicrocredits != 275*CreditScale {
		t.Fatalf("postgres invite account mismatch: %#v error=%v", account, err)
	}
	var ledger model.CreditLedgerEntry
	if err := db.First(&ledger, "user_id = ? AND type = ?", result.User.ID, model.CreditLedgerSignupBonus).Error; err != nil {
		t.Fatal(err)
	}
	expectedReference := "signup:" + result.User.ID
	if ledger.AmountMicrocredits != 275*CreditScale || ledger.AvailableAfterMicrocredits != 275*CreditScale || ledger.ReferenceKey == nil || *ledger.ReferenceKey != expectedReference || ledger.Note != "邀请注册积分" {
		t.Fatalf("postgres invite ledger mismatch: %#v", ledger)
	}
	var sessionCount int64
	if err := db.Model(&model.AuthSession{}).Where("user_id = ?", result.User.ID).Count(&sessionCount).Error; err != nil || sessionCount != 1 {
		t.Fatalf("postgres invited session count=%d error=%v", sessionCount, err)
	}
}

func TestPostgresRegistrationInviteRollsBackEveryWriteOnLedgerFailure(t *testing.T) {
	svc, db, admin := newPostgresRegistrationInviteTestService(t, "invite_rollback")
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 7, CreditAmountMicrocredits: 50 * CreditScale})
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Exec(`
		CREATE FUNCTION fail_invite_credit_ledger() RETURNS trigger AS $$
		BEGIN
			IF NEW.note = '邀请注册积分' THEN
				RAISE EXCEPTION 'forced invite credit ledger failure';
			END IF;
			RETURN NEW;
		END;
		$$ LANGUAGE plpgsql;
		CREATE TRIGGER fail_invite_credit_ledger
		BEFORE INSERT ON credit_ledger_entries
		FOR EACH ROW EXECUTE FUNCTION fail_invite_credit_ledger();
	`).Error; err != nil {
		t.Fatal(err)
	}

	if _, clearInvite, err := svc.RegisterWithInvitation(RegisterRequest{Username: "postgres-rollback", Password: "password-123"}, created.Token); err == nil || clearInvite {
		t.Fatalf("forced postgres ledger failure result: clear=%v error=%v", clearInvite, err)
	}
	var invite model.RegistrationInvite
	if err := db.First(&invite, "id = ?", created.Invite.ID).Error; err != nil {
		t.Fatal(err)
	}
	if invite.UsedAt != nil || invite.UsedBy != nil {
		t.Fatalf("failed postgres signup consumed invite: %#v", invite)
	}
	for table, query := range map[string]string{
		"users":                 "SELECT COUNT(*) FROM users WHERE username = 'postgres-rollback'",
		"credit_accounts":       "SELECT COUNT(*) FROM credit_accounts ca JOIN users u ON u.id = ca.user_id WHERE u.username = 'postgres-rollback'",
		"credit_ledger_entries": "SELECT COUNT(*) FROM credit_ledger_entries cl JOIN users u ON u.id = cl.user_id WHERE u.username = 'postgres-rollback'",
		"auth_sessions":         "SELECT COUNT(*) FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.username = 'postgres-rollback'",
	} {
		var count int64
		if err := db.Raw(query).Scan(&count).Error; err != nil || count != 0 {
			t.Fatalf("postgres rollback left %s rows=%d error=%v", table, count, err)
		}
	}
}

func TestPostgresRegistrationInviteConcurrentUseSucceedsOnce(t *testing.T) {
	svc, db, admin := newPostgresRegistrationInviteTestService(t, "invite_concurrency")
	created, err := svc.CreateRegistrationInvite(admin, CreateRegistrationInviteRequest{ExpiresInDays: 7, CreditAmountMicrocredits: 100 * CreditScale})
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, username := range []string{"postgres-parallel-one", "postgres-parallel-two"} {
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
		t.Fatalf("postgres concurrent successes=%d, want 1", successes)
	}

	for table, query := range map[string]string{
		"users":                 "SELECT COUNT(*) FROM users WHERE username LIKE 'postgres-parallel-%'",
		"credit_accounts":       "SELECT COUNT(*) FROM credit_accounts ca JOIN users u ON u.id = ca.user_id WHERE u.username LIKE 'postgres-parallel-%'",
		"credit_ledger_entries": "SELECT COUNT(*) FROM credit_ledger_entries cl JOIN users u ON u.id = cl.user_id WHERE u.username LIKE 'postgres-parallel-%' AND cl.note = '邀请注册积分'",
		"auth_sessions":         "SELECT COUNT(*) FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE u.username LIKE 'postgres-parallel-%'",
	} {
		var count int64
		if err := db.Raw(query).Scan(&count).Error; err != nil || count != 1 {
			t.Fatalf("postgres concurrent %s rows=%d error=%v", table, count, err)
		}
	}
}

func newPostgresRegistrationInviteTestService(t *testing.T, prefix string) (*Service, *gorm.DB, *model.User) {
	t.Helper()
	dsn := strings.TrimSpace(os.Getenv("CANVAS_TEST_POSTGRES_DSN"))
	if dsn == "" {
		t.Skip("CANVAS_TEST_POSTGRES_DSN is not configured")
	}
	base, err := database.Open(database.Config{Driver: "postgres", DSN: dsn})
	if err != nil {
		t.Fatalf("open postgres: %v", err)
	}
	baseSQL, err := base.DB()
	if err != nil {
		t.Fatal(err)
	}
	schemaName := fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	if err := base.Exec(`CREATE SCHEMA "` + schemaName + `"`).Error; err != nil {
		_ = baseSQL.Close()
		t.Fatalf("create postgres test schema: %v", err)
	}
	dropSchema := func() {
		if err := base.Exec(`DROP SCHEMA IF EXISTS "` + schemaName + `" CASCADE`).Error; err != nil {
			t.Errorf("drop postgres test schema: %v", err)
		}
		_ = baseSQL.Close()
	}
	parsed, err := url.Parse(dsn)
	if err != nil {
		dropSchema()
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schemaName)
	parsed.RawQuery = query.Encode()
	db, err := database.Open(database.Config{Driver: "postgres", DSN: parsed.String()})
	if err != nil {
		dropSchema()
		t.Fatal(err)
	}
	dbSQL, err := db.DB()
	if err != nil {
		dropSchema()
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = dbSQL.Close()
		dropSchema()
	})
	if err := database.ConfigurePool(db); err != nil {
		t.Fatal(err)
	}
	if err := database.MigrateSchema(db); err != nil {
		t.Fatalf("migrate postgres invite schema: %v", err)
	}
	now := time.Now().UTC()
	admin := &model.User{ID: "postgres-invite-admin", Username: "postgres-invite-admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive, CreatedAt: now, UpdatedAt: now}
	if err := db.Create(admin).Error; err != nil {
		t.Fatal(err)
	}
	closed := model.SystemSetting{Key: registrationSettingKey, ValueJSON: `{"enabled":false}`, UpdatedBy: admin.ID}
	if err := db.Create(&closed).Error; err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), t.TempDir()), db, admin
}
