package service

import (
	"errors"
	"net/http"
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
		"empty title": func(config *PublicSiteConfig) { config.Hero.Title = "" },
		"unsafe url":  func(config *PublicSiteConfig) { config.Hero.ShowreelURL = "javascript:alert(1)" },
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
