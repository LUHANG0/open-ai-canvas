package service

import (
	"errors"
	"net/http"
	"testing"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func TestBrandingDefaultsUpdateConflictAndReset(t *testing.T) {
	svc, db := newBrandingTestService(t)
	admin := &model.User{ID: "admin", Role: model.UserRoleAdmin, Status: model.UserStatusActive}

	public, err := svc.PublicBranding()
	if err != nil {
		t.Fatal(err)
	}
	if public.Revision != 0 || public.Config.Identity.DisplayName != "影策" || public.Assets.LogoURL != "/logo.svg" {
		t.Fatalf("default branding = %+v", public)
	}

	config := DefaultBrandingConfig()
	config.Identity.DisplayName = "光场"
	config.Identity.ShortName = "光场"
	config.Theme.PrimaryColor = "#12abef"
	updated, err := svc.UpdateBranding(admin, UpdateBrandingRequest{ExpectedRevision: 0, Config: config})
	if err != nil {
		t.Fatal(err)
	}
	if updated.Revision != 1 || updated.Config.Identity.DisplayName != "光场" || updated.Config.Theme.PrimaryColor != "#12ABEF" || !updated.Configured {
		t.Fatalf("updated branding = %+v", updated)
	}

	_, err = svc.UpdateBranding(admin, UpdateBrandingRequest{ExpectedRevision: 0, Config: config})
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != http.StatusConflict {
		t.Fatalf("stale update error = %v, want conflict", err)
	}

	reset, err := svc.ResetBranding(admin, updated.Revision)
	if err != nil {
		t.Fatal(err)
	}
	if reset.Revision != 2 || reset.Config != DefaultBrandingConfig() {
		t.Fatalf("reset branding = %+v", reset)
	}

	var auditCount int64
	if err := db.Model(&model.AdminAuditEvent{}).Where("target_id = ?", brandingSettingKey).Count(&auditCount).Error; err != nil {
		t.Fatal(err)
	}
	if auditCount != 2 {
		t.Fatalf("audit count = %d, want 2 successful changes", auditCount)
	}
}

func TestBrandingValidationAndAssetSniffing(t *testing.T) {
	config := DefaultBrandingConfig()
	config.Identity.DisplayName = ""
	if _, err := normalizeBrandingConfig(config); err == nil {
		t.Fatal("empty display name should be rejected")
	}

	if got := detectBrandAssetMime([]byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}); got != "image/png" {
		t.Fatalf("PNG mime = %q", got)
	}
	if got := detectBrandAssetMime([]byte{0, 0, 0, 0, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}); got != "video/mp4" {
		t.Fatalf("MP4 mime = %q", got)
	}
	if brandAssetMimeAllowed(BrandAssetLogo, "video/mp4") {
		t.Fatal("logo slot must reject video")
	}
	if !brandAssetMimeAllowed(BrandAssetAuthHero, "video/mp4") {
		t.Fatal("auth hero slot should accept video")
	}
	if got := formatBrandAssetLimit(brandFaviconMaxBytes); got != "512KB" {
		t.Fatalf("favicon limit = %q", got)
	}
}

func newBrandingTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	return New(repository.New(db), t.TempDir()), db
}
