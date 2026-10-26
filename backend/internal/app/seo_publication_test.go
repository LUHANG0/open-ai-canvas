package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"yingce/backend/internal/model"
	"yingce/backend/internal/publicsite"
	"yingce/backend/internal/repository"
)

func newSEOTestService(t *testing.T) (*Service, *gorm.DB, string) {
	t.Helper()
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://example.test")
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	raw.SetMaxOpenConns(1)
	t.Cleanup(func() { raw.Close() })
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	svc := New(repository.New(db), dir)
	t.Cleanup(func() { svc.Close() })
	return svc, db, dir
}

type seoRoundTrip func(*http.Request) (*http.Response, error)

func (f seoRoundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSEOEncryptedConfigAuditCASAndAdmin(t *testing.T) {
	svc, db, _ := newSEOTestService(t)
	admin := &model.User{ID: "seo-admin", Role: model.UserRoleAdmin}
	if _, err := svc.AdminSEOSettings(&model.User{Role: model.UserRoleUser}); err == nil {
		t.Fatal("user can read configuration")
	}
	input := SEOSettingsRequest{Enabled: true, BaiduEnabled: true, IndexNowEnabled: true, BaiduToken: "test-secret-token"}
	view, err := svc.UpdateSEOSettings(admin, input)
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := publicsite.Default()
	if err != nil {
		t.Fatal(err)
	}
	if !view.HasBaiduToken || !view.HasIndexNowKey || len(view.Pages) != len(catalog.Pages())+1 {
		t.Fatalf("config view incomplete: %+v", view)
	}
	var rows []model.SystemSetting
	db.Find(&rows)
	for _, row := range rows {
		if strings.Contains(row.ValueJSON, input.BaiduToken) {
			t.Fatal("plaintext token stored")
		}
	}
	var audits []model.AdminAuditEvent
	db.Find(&audits)
	b, _ := json.Marshal(audits)
	if len(audits) != 1 || strings.Contains(string(b), input.BaiduToken) {
		t.Fatal("redacted atomic audit missing")
	}
	b, _ = json.Marshal(view)
	if strings.Contains(string(b), input.BaiduToken) {
		t.Fatal("token returned to admin")
	}
	if _, err := svc.UpdateSEOSettings(admin, input); err == nil {
		t.Fatal("stale config overwrote")
	}
	input.Revision = view.Revision
	input.BaiduAllowHTTP = true
	input.BaiduToken = ""
	view, err = svc.UpdateSEOSettings(admin, input)
	if err != nil || !view.HasBaiduToken || !view.BaiduAllowHTTP {
		t.Fatal("blank token did not preserve existing")
	}
	_, cfg, err := svc.readSEOSettings()
	if err != nil {
		t.Fatal(err)
	}
	if key, err := svc.PublicIndexNowKey("/" + cfg.IndexNowKey + ".txt"); err != nil || key != cfg.IndexNowKey {
		t.Fatal("public key file not available")
	}
	if _, err := svc.PublicIndexNowKey("/wrong.txt"); err == nil {
		t.Fatal("arbitrary file allowed")
	}
	input.Revision = view.Revision
	input.ClearBaiduToken = true
	view, err = svc.UpdateSEOSettings(admin, input)
	if err != nil || view.HasBaiduToken {
		t.Fatal("explicit clear failed")
	}
}

func TestSEOIdempotentScanPersistenceAndDisabledWorker(t *testing.T) {
	svc, db, dir := newSEOTestService(t)
	admin := &model.User{ID: "seo-admin", Role: model.UserRoleAdmin}
	calls := 0
	client := &http.Client{Transport: seoRoundTrip(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 202, Header: http.Header{}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})}
	if err := svc.processSEO(context.Background(), client); err != nil || calls != 0 {
		t.Fatal("disabled worker sent traffic")
	}
	v, err := svc.UpdateSEOSettings(admin, SEOSettingsRequest{Enabled: true, IndexNowEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	total := len(v.Pages)
	for i := 0; i < (total+9)/10; i++ {
		if err := svc.processSEO(context.Background(), client); err != nil {
			t.Fatal(err)
		}
	}
	if calls != total {
		t.Fatalf("new page scan: %d", calls)
	}
	restarted := New(repository.New(db), dir)
	t.Cleanup(func() { restarted.Close() })
	if err := restarted.processSEO(context.Background(), client); err != nil || calls != total {
		t.Fatalf("restart resent accepted versions: %d %v", calls, err)
	}
	if _, err := svc.UpdateSEOSettings(admin, SEOSettingsRequest{Revision: v.Revision, Enabled: false}); err != nil {
		t.Fatal(err)
	}
	if err := svc.processSEO(context.Background(), client); err != nil || calls != total {
		t.Fatal("disabled worker kept sending")
	}
	// A second service cannot claim a persisted unexpired lease.
	_, state, err := svc.readSEOState()
	if err != nil {
		t.Fatal(err)
	}
	state.Jobs = nil
	entries := []publicsite.Entry{{URL: "https://example.test/new", Revision: "new"}}
	now := time.Now()
	var first, second *publicsite.Job
	if err := svc.updateSEOState(func(s *publicsite.SubmissionState) {
		s.Jobs = nil
		s.Sync(entries, []string{"indexnow"}, 99, now)
		first = s.Claim(now, "instance-one")
	}); err != nil {
		t.Fatal(err)
	}
	if err := restarted.updateSEOState(func(s *publicsite.SubmissionState) { second = s.Claim(now, "instance-two") }); err != nil {
		t.Fatal(err)
	}
	if first == nil || second != nil {
		t.Fatal("persisted lease not exclusive")
	}
}

func TestSEOSitemapStableAndPublishedHomepageOnly(t *testing.T) {
	svc, _, _ := newSEOTestService(t)
	admin := &model.User{ID: "seo-admin", Role: model.UserRoleAdmin}
	before, err := svc.publicSiteEntries()
	if err != nil {
		t.Fatal(err)
	}
	state, err := svc.AdminBrandSite(admin)
	if err != nil {
		t.Fatal(err)
	}
	state.Draft.Title = "private unpublished title"
	state, err = svc.ChangeBrandSite(admin, "draft", BrandSiteChange{Revision: state.Revision, Content: state.Draft})
	if err != nil {
		t.Fatal(err)
	}
	after, err := svc.publicSiteEntries()
	if err != nil {
		t.Fatal(err)
	}
	if before[0].Revision != after[0].Revision || !before[0].UpdatedAt.Equal(after[0].UpdatedAt) {
		t.Fatal("draft altered public sitemap revision")
	}
	if _, err := svc.ChangeBrandSite(admin, "publish", BrandSiteChange{Revision: state.Revision}); err != nil {
		t.Fatal(err)
	}
	after, err = svc.publicSiteEntries()
	if err != nil || before[0].Revision == after[0].Revision {
		t.Fatal("published homepage not requeued")
	}
	a, err := svc.PublicSitemap()
	if err != nil {
		t.Fatal(err)
	}
	b, err := svc.PublicSitemap()
	if err != nil || string(a) != string(b) {
		t.Fatal("lastmod changes on every request")
	}
}
