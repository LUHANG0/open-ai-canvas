package service

import (
	"errors"
	"net/http"
	"strings"
	"testing"

	"infinite-canvas/backend/internal/model"
)

func TestPublicSiteDraftPublishConflictAndReset(t *testing.T) {
	svc, db := newBrandingTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}

	public, err := svc.PublicSite()
	if err != nil {
		t.Fatal(err)
	}
	if public.Revision != 0 || public.Config.Hero.Title != "让故事开机。" || len(public.Config.Showcases) != 3 {
		t.Fatalf("default public site = %+v", public)
	}

	draft := DefaultPublicSiteConfig()
	draft.Hero.Title = "让每个镜头发生"
	draft.Showcases[0].ExternalURL = "https://www.bilibili.com/video/BV1test"
	updated, err := svc.UpdatePublicSiteDraft(admin, UpdatePublicSiteRequest{ExpectedRevision: 0, Config: draft})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 1 || !updated.Dirty || updated.Draft.Hero.Title != "让每个镜头发生" || updated.Published.Hero.Title == updated.Draft.Hero.Title {
		t.Fatalf("updated public site = %+v", updated)
	}

	stillPublished, err := svc.PublicSite()
	if err != nil {
		t.Fatal(err)
	}
	if stillPublished.Revision != 0 || stillPublished.Config.Hero.Title != "让故事开机。" {
		t.Fatalf("draft leaked into public site = %+v", stillPublished)
	}

	published, err := svc.PublishPublicSite(admin, updated.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if published.Revision != 2 || published.PublishedRevision != 2 || published.Dirty || published.Published.Hero.Title != "让每个镜头发生" {
		t.Fatalf("published public site = %+v", published)
	}

	_, err = svc.UpdatePublicSiteDraft(admin, UpdatePublicSiteRequest{ExpectedRevision: 1, Config: draft})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != http.StatusConflict {
		t.Fatalf("stale update error = %v, want conflict", err)
	}

	reset, err := svc.ResetPublicSiteDraft(admin, published.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if reset.Revision != 3 || !reset.Dirty || reset.Draft.Hero.Title != "让故事开机。" || reset.Published.Hero.Title != "让每个镜头发生" {
		t.Fatalf("reset draft = %+v", reset)
	}

	var auditCount int64
	if err := db.Model(&model.AdminAuditEvent{}).Where("target_id = ?", publicSiteSettingKey).Count(&auditCount).Error; err != nil {
		t.Fatal(err)
	}
	if auditCount != 3 {
		t.Fatalf("audit count = %d, want 3", auditCount)
	}
}

func TestPublicSiteValidation(t *testing.T) {
	for name, mutate := range map[string]func(*PublicSiteConfig){
		"empty title":     func(config *PublicSiteConfig) { config.Hero.Title = "" },
		"unsafe url":      func(config *PublicSiteConfig) { config.Hero.ShowreelURL = "javascript:alert(1)" },
		"unsafe icp":      func(config *PublicSiteConfig) { config.Links.ICPURL = "javascript:alert(1)" },
		"relative icp":    func(config *PublicSiteConfig) { config.Links.ICPURL = "/registration" },
		"icp credentials": func(config *PublicSiteConfig) { config.Links.ICPURL = "https://user:pass@example.com" },
		"long icp":        func(config *PublicSiteConfig) { config.Links.ICPText = strings.Repeat("备", 121) },
		"duplicate id": func(config *PublicSiteConfig) {
			config.Showcases[1].ID = config.Showcases[0].ID
		},
	} {
		t.Run(name, func(t *testing.T) {
			config := DefaultPublicSiteConfig()
			mutate(&config)
			if _, err := normalizePublicSiteConfig(config); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestSiteDisplayPreservesOtherDraftsAndPublishesOnlyDisplay(t *testing.T) {
	svc, db := newBrandingTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	draft := DefaultPublicSiteConfig()
	draft.Hero.Title = "尚未发布的官网标题"
	_, err := svc.UpdatePublicSiteDraft(admin, UpdatePublicSiteRequest{ExpectedRevision: 0, Config: draft})
	if err != nil {
		t.Fatal(err)
	}
	request := UpdateSiteDisplayRequest{ExpectedRevision: 1, PosterURL: " /brand/last-train-wide.webp ", ContactURL: "https://example.com/contact", ICPText: " 自动化测试备案文字 ", ICPURL: ""}
	updated, err := svc.UpdateSiteDisplay(admin, request)
	if err != nil {
		t.Fatal(err)
	}
	if updated.PublishedRevision != 2 || updated.Revision != 2 || !updated.Dirty {
		t.Fatalf("unexpected revisions/state: %+v", updated)
	}
	if updated.Draft.Hero.Title != draft.Hero.Title || updated.Published.Hero.Title != DefaultPublicSiteConfig().Hero.Title {
		t.Fatal("unrelated title was overwritten or published")
	}
	public, err := svc.PublicSite()
	if err != nil {
		t.Fatal(err)
	}
	if public.Config.Hero.PosterURL != "/brand/last-train-wide.webp" || public.Config.Links.ICPText != "自动化测试备案文字" || public.Config.Links.ICPURL != "https://beian.miit.gov.cn/" || public.Config.Links.ContactURL != request.ContactURL {
		t.Fatalf("display not published: %+v", public.Config)
	}
	if updated.Draft.Links.ICPText != public.Config.Links.ICPText {
		t.Fatal("later draft publish would undo filing settings")
	}
	_, err = svc.UpdateSiteDisplay(admin, request)
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != http.StatusConflict {
		t.Fatalf("stale update: %v", err)
	}
	cleared, err := svc.UpdateSiteDisplay(admin, UpdateSiteDisplayRequest{ExpectedRevision: 2})
	if err != nil {
		t.Fatal(err)
	}
	if cleared.Published.Links.ICPText != "" || cleared.Published.Links.ContactURL != "" || cleared.Published.Hero.PosterURL != "" || cleared.Draft.Hero.Title != draft.Hero.Title {
		t.Fatal("clearing display damaged unrelated settings")
	}
	var count int64
	if err := db.Model(&model.AdminAuditEvent{}).Where("action = ?", "public_site.display.update").Count(&count).Error; err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("display audits = %d", count)
	}
}

func TestSiteDisplayRejectsInvalidAndNonAdminUpdates(t *testing.T) {
	svc, _ := newBrandingTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	for _, req := range []UpdateSiteDisplayRequest{
		{ICPURL: "javascript:alert(1)"}, {ICPText: strings.Repeat("备", 121)}, {PosterURL: "javascript:alert(1)"}, {ContactURL: "https://user:pass@example.com"},
	} {
		if _, err := svc.UpdateSiteDisplay(admin, req); err == nil {
			t.Fatalf("accepted invalid display: %+v", req)
		}
	}
	for _, actor := range []*model.User{nil, {ID: "user", Role: model.UserRoleUser, Status: model.UserStatusActive}} {
		if _, err := svc.UpdateSiteDisplay(actor, UpdateSiteDisplayRequest{}); err == nil {
			t.Fatal("accepted non-admin update")
		}
	}
	public, err := svc.PublicSite()
	if err != nil {
		t.Fatal(err)
	}
	if public.Revision != 0 {
		t.Fatal("rejected update changed published state")
	}
}

func TestPublicSiteICPDraftIsPrivateUntilPublished(t *testing.T) {
	svc, _ := newBrandingTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}
	config := DefaultPublicSiteConfig()
	config.Links.ICPText = "  测试备案号（仅自动化测试）  "
	config.Links.ICPURL = "  https://beian.miit.gov.cn/  "
	saved, err := svc.UpdatePublicSiteDraft(admin, UpdatePublicSiteRequest{ExpectedRevision: 0, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	public, err := svc.PublicSite()
	if err != nil {
		t.Fatal(err)
	}
	if public.Config.Links.ICPText != "" {
		t.Fatal("draft ICP was exposed publicly")
	}
	if _, err := svc.PublishPublicSite(admin, saved.Revision); err != nil {
		t.Fatal(err)
	}
	public, err = svc.PublicSite()
	if err != nil {
		t.Fatal(err)
	}
	if public.Config.Links.ICPText != "测试备案号（仅自动化测试）" || public.Config.Links.ICPURL != "https://beian.miit.gov.cn/" {
		t.Fatalf("published ICP = %+v", public.Config.Links)
	}
	config.Links.ICPText = ""
	config.Links.ICPURL = ""
	normalized, err := normalizePublicSiteConfig(config)
	if err != nil || normalized.Links.ICPURL != "https://beian.miit.gov.cn/" {
		t.Fatalf("empty ICP fallback = %+v, %v", normalized.Links, err)
	}
}
