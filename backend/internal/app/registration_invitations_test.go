package app

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"yingce/backend/internal/model"
)

func TestInvitationAdminPermissionsSnapshotAndPublicPrivacy(t *testing.T) {
	svc, db, _, admin := newAppearanceTestService(t)
	t.Cleanup(func() { _ = svc.Close() })
	if err := db.AutoMigrate(&model.RegistrationInvitation{}); err != nil {
		t.Fatal(err)
	}
	amount := int64(123456789)
	req := CreateRegistrationInvitationRequest{Note: "private team note", BonusMicrocredits: &amount}
	for _, actor := range []*model.User{nil, {ID: admin.ID, Role: model.UserRoleUser}} {
		if _, err := svc.CreateRegistrationInvitation(actor, req); err == nil {
			t.Fatal("non-admin create succeeded")
		}
		if _, _, err := svc.ListRegistrationInvitations(actor, 1, 20); err == nil {
			t.Fatal("non-admin list succeeded")
		}
		if err := svc.RevokeRegistrationInvitation(actor, "any"); err == nil {
			t.Fatal("non-admin revoke succeeded")
		}
	}
	item, err := svc.CreateRegistrationInvitation(admin, req)
	if err != nil {
		t.Fatal(err)
	}
	if len(item.Code) != 6 || item.BonusMicrocredits != amount || item.State != "valid" || item.ExpiresAt.Sub(item.CreatedAt) != 7*24*time.Hour {
		t.Fatalf("bad invitation %#v", item)
	}
	var stored model.RegistrationInvitation
	db.First(&stored, "id = ?", item.ID)
	if stored.CodeEncrypted == item.Code || stored.CodeHash == item.Code || stored.CodeEncrypted == "" {
		t.Fatal("usable code persisted in plaintext")
	}
	policy := defaultCreditPolicy()
	policy.SignupBonusMicrocredits = 900_000000
	if _, err := svc.UpdateCreditPolicy(admin, policy); err != nil {
		t.Fatal(err)
	}
	public, err := svc.ValidateRegistrationInvitation(item.Code)
	if err != nil {
		t.Fatal(err)
	}
	if public.BonusMicrocredits == nil || *public.BonusMicrocredits != amount || public.Settings == nil || public.Settings.LinuxDOEnabled || !public.Settings.RegistrationEnabled {
		t.Fatalf("bad public snapshot %#v", public)
	}
	encoded, _ := json.Marshal(public)
	for _, secret := range []string{req.Note, admin.ID, "createdBy", "codeHash", "codeEncrypted", item.Code} {
		if strings.Contains(string(encoded), secret) {
			t.Fatalf("public metadata leaked %s", secret)
		}
	}
	items, total, err := svc.ListRegistrationInvitations(admin, 1, 20)
	if err != nil || total != 1 || items[0].Code != item.Code {
		t.Fatalf("admin listing: total=%d err=%v", total, err)
	}
	if err := svc.RevokeRegistrationInvitation(admin, item.ID); err != nil {
		t.Fatal(err)
	}
	public, err = svc.ValidateRegistrationInvitation(item.Code)
	if err != nil || public.State != "revoked" || public.Settings != nil || public.BonusMicrocredits != nil {
		t.Fatalf("revoked response %#v %v", public, err)
	}
	var audits []model.AdminAuditEvent
	db.Where("target_id = ?", item.ID).Find(&audits)
	if len(audits) != 2 {
		t.Fatalf("audit count=%d", len(audits))
	}
	for _, audit := range audits {
		if strings.Contains(audit.MetadataJSON, item.Code) {
			t.Fatal("audit contains code")
		}
	}
	if err := db.Model(admin).Update("role", model.UserRoleUser).Error; err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.ListRegistrationInvitations(admin, 1, 20); err == nil {
		t.Fatal("stale admin role was trusted")
	}
}

func TestInvitationAdminAmountValidationAndZero(t *testing.T) {
	svc, db, _, admin := newAppearanceTestService(t)
	t.Cleanup(func() { _ = svc.Close() })
	if err := db.AutoMigrate(&model.RegistrationInvitation{}); err != nil {
		t.Fatal(err)
	}
	for _, value := range []int64{-1, 1_000_000_000_001} {
		if _, err := svc.CreateRegistrationInvitation(admin, CreateRegistrationInvitationRequest{BonusMicrocredits: &value}); err == nil {
			t.Fatalf("accepted amount %d", value)
		}
	}
	if _, err := svc.CreateRegistrationInvitation(admin, CreateRegistrationInvitationRequest{}); err == nil {
		t.Fatal("empty amount became zero")
	}
	zero := int64(0)
	for _, days := range []int{-1, 91} {
		if _, err := svc.CreateRegistrationInvitation(admin, CreateRegistrationInvitationRequest{BonusMicrocredits: &zero, ExpiresInDays: days}); err == nil {
			t.Fatal("accepted invalid expiry")
		}
	}
	if _, err := svc.CreateRegistrationInvitation(admin, CreateRegistrationInvitationRequest{BonusMicrocredits: &zero}); err != nil {
		t.Fatal(err)
	}
}
