package handler

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"yingce/backend/internal/model"
)

func TestInvitationHTTPPermissionsPrivacyAndRateLimits(t *testing.T) {
	router, db, cookie := profileHandlerFixture(t)
	if err := db.AutoMigrate(&model.RegistrationInvitation{}); err != nil {
		t.Fatal(err)
	}
	for _, route := range []struct{ method, path string }{{"GET", "/api/admin/registration-invitations"}, {"POST", "/api/admin/registration-invitations"}, {"POST", "/api/admin/registration-invitations/id/revoke"}} {
		for _, identity := range []string{"", cookie} {
			rec := profileRequest(router, route.method, route.path, `{"bonusMicrocredits":0}`, identity)
			if rec.Code != 401 && rec.Code != 403 {
				t.Fatalf("non-admin %s status=%d", route.path, rec.Code)
			}
		}
	}
	if err := db.Model(&model.User{}).Where("id = ?", "profile-user").Update("role", model.UserRoleAdmin).Error; err != nil {
		t.Fatal(err)
	}
	for _, body := range []string{`{}`, `{"bonusMicrocredits":0.1}`, `{"bonusMicrocredits":-1}`, `{"bonusMicrocredits":1000000000001}`} {
		rec := profileRequest(router, "POST", "/api/admin/registration-invitations", body, cookie)
		if rec.Code != 400 {
			t.Fatalf("invalid amount status=%d body=%s", rec.Code, rec.Body.String())
		}
	}
	rec := profileRequest(router, "POST", "/api/admin/registration-invitations", `{"note":"internal-admin-only","bonusMicrocredits":0,"expiresInDays":7,"role":"admin"}`, cookie)
	if rec.Code != 200 {
		t.Fatalf("create %d %s", rec.Code, rec.Body.String())
	}
	var created struct {
		Data struct{ Invitation struct{ ID, Code string } }
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	item := created.Data.Invitation
	rec = profileRequest(router, "POST", "/api/auth/invitation/validate", fmt.Sprintf(`{"code":%q}`, item.Code), "")
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("validate status %d", rec.Code)
	}
	for _, value := range []string{item.Code, "internal-admin-only", "profile-user", "codeHash", "codeEncrypted"} {
		if strings.Contains(rec.Body.String(), value) {
			t.Fatalf("public disclosure %s", value)
		}
	}
	if !strings.Contains(rec.Body.String(), `"bonusMicrocredits":0`) {
		t.Fatal("zero omitted")
	}
	rec = profileRequest(router, "POST", "/api/auth/register", fmt.Sprintf(`{"invitationCode":%q,"username":"another-user","password":"strong-password","acceptedTerms":true}`, item.Code), cookie)
	if rec.Code != 403 {
		t.Fatalf("logged-in invited registration status=%d", rec.Code)
	}
	rec = profileRequest(router, "POST", "/api/admin/registration-invitations/"+item.ID+"/revoke", "{}", cookie)
	if rec.Code != 200 {
		t.Fatalf("revoke %d %s", rec.Code, rec.Body.String())
	}
	rec = profileRequest(router, "POST", "/api/auth/invitation/validate", fmt.Sprintf(`{"code":%q}`, item.Code), "")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `"state":"revoked"`) {
		t.Fatalf("revoke validate %s", rec.Body.String())
	}
	for i := 0; i < 31; i++ {
		rec = profileRequest(router, "POST", "/api/auth/invitation/validate", `{"code":"XXXXXX"}`, "")
	}
	if rec.Code != 429 || rec.Header().Get("Retry-After") == "" {
		t.Fatalf("enumeration limit status=%d", rec.Code)
	}
}
