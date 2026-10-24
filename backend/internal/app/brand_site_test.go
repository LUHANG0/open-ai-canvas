package app

import (
	"encoding/json"
	"testing"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestBrandSitePublicationLifecycle(t *testing.T) {
	s, db, dir, admin := newAppearanceTestService(t)
	state, err := s.AdminBrandSite(admin)
	if err != nil {
		t.Fatal(err)
	}
	if state.Revision != 0 || state.Previous != nil {
		t.Fatal("unexpected initial state")
	}
	draft := state.Draft
	draft.Title = "仅草稿可见"
	draft.HeroMedia = BrandSiteMedia{ResourceID: "missing", Kind: "image", Alt: "无效媒体"}
	if _, err = s.ChangeBrandSite(admin, "draft", BrandSiteChange{Content: draft}); err == nil {
		t.Fatal("invalid media accepted")
	}
	draft.HeroMedia = BrandSiteMedia{}
	state, err = s.ChangeBrandSite(admin, "draft", BrandSiteChange{Content: draft})
	if err != nil {
		t.Fatal(err)
	}
	public, _ := s.PublicBrandSite()
	if public.Title == draft.Title {
		t.Fatal("draft leaked")
	}
	fresh := New(repository.New(db), dir)
	loaded, _ := fresh.AdminBrandSite(admin)
	if loaded.Draft.Title != draft.Title {
		t.Fatal("draft not persistent")
	}
	if _, err = s.ChangeBrandSite(admin, "publish", BrandSiteChange{Revision: 0}); err == nil {
		t.Fatal("stale revision accepted")
	}
	state, err = s.ChangeBrandSite(admin, "publish", BrandSiteChange{Revision: loaded.Revision})
	if err != nil {
		t.Fatal(err)
	}
	public, _ = s.PublicBrandSite()
	if public.Title != draft.Title {
		t.Fatal("publication failed")
	}
	state, err = s.ChangeBrandSite(admin, "restore", BrandSiteChange{Revision: state.Revision})
	if err != nil {
		t.Fatal(err)
	}
	public, _ = s.PublicBrandSite()
	if public.Title == draft.Title || state.Draft.Title != draft.Title {
		t.Fatal("restore did not retain separate draft")
	}
	// A second service cannot overwrite the publication with a stale snapshot.
	if _, err = fresh.ChangeBrandSite(admin, "draft", BrandSiteChange{Revision: loaded.Revision, Content: draft}); err == nil {
		t.Fatal("multi-instance conflict ignored")
	}
	beforeFailure, err := s.PublicBrandSite()
	if err != nil {
		t.Fatal(err)
	}
	old, _ := json.Marshal(beforeFailure)
	invalid := draft
	invalid.Sections = append([]BrandSiteSection{}, draft.Sections...)
	invalid.Sections[0].Items = append([]BrandSiteItem{}, draft.Sections[0].Items...)
	invalid.Sections[0].Items[0].Link = "javascript:alert(1)"
	if _, err = s.ChangeBrandSite(admin, "draft", BrandSiteChange{Revision: state.Revision, Content: invalid}); err == nil {
		t.Fatal("script link accepted")
	}
	public, _ = s.PublicBrandSite()
	after, _ := json.Marshal(public)
	if string(old) != string(after) {
		t.Fatal("failure polluted publication")
	}
}
func TestBrandSitePermissionsAndMediaIsolation(t *testing.T) {
	s, _, _, admin := newAppearanceTestService(t)
	user := &model.User{ID: "ordinary", Role: model.UserRoleUser}
	for _, actor := range []*model.User{nil, user} {
		if _, err := s.AdminBrandSite(actor); err == nil {
			t.Fatal("non-admin read draft")
		}
		if _, err := s.ChangeBrandSite(actor, "draft", BrandSiteChange{Content: defaultBrandSiteContent()}); err == nil {
			t.Fatal("non-admin saved draft")
		}
	}
	// Use a real validated upload; anonymous media remains inaccessible until publish.
	file := multipartFileHeader(t, "brand.png", "image/png", []byte{137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0})
	resource, err := s.UploadAppearanceAsset(admin, "brand-image", file)
	if err != nil {
		t.Fatal(err)
	}
	if resource.Provider != "local" || resource.PublicURL != "" {
		t.Fatal("draft upload not private")
	}
	if _, err = s.PrepareBrandSiteMedia(nil, resource.ID, ResourceAccessOptions{}, ""); err == nil {
		t.Fatal("unpublished upload leaked")
	}
	content := defaultBrandSiteContent()
	content.HeroMedia = BrandSiteMedia{ResourceID: resource.ID, Kind: "image", Alt: "海边车站"}
	state, err := s.ChangeBrandSite(admin, "draft", BrandSiteChange{Content: content})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.PrepareBrandSiteMedia(nil, resource.ID, ResourceAccessOptions{}, ""); err == nil {
		t.Fatal("saved draft leaked")
	}
	if len(s.appearanceResourceReferences([]string{resource.ID})[resource.ID]) == 0 {
		t.Fatal("draft deletion protection missing")
	}
	state, err = s.ChangeBrandSite(admin, "publish", BrandSiteChange{Revision: state.Revision})
	if err != nil {
		t.Fatal(err)
	}
	delivery, err := s.PrepareBrandSiteMedia(nil, resource.ID, ResourceAccessOptions{}, "")
	if err != nil {
		t.Fatal(err)
	}
	if delivery.Stream != nil {
		_ = delivery.Stream.Body.Close()
	}
	_, err = s.ChangeBrandSite(admin, "restore", BrandSiteChange{Revision: state.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.PrepareBrandSiteMedia(nil, resource.ID, ResourceAccessOptions{}, ""); err == nil {
		t.Fatal("removed publication still exposed")
	}
	if len(s.appearanceResourceReferences([]string{resource.ID})[resource.ID]) == 0 {
		t.Fatal("previous publication deletion protection missing")
	}
}
func TestMengCengAppearanceMigrationPreservesCustom(t *testing.T) {
	value := AppearanceSetting{BrandName: "影策", BrandSlug: "open-ai-canvas", FooterCopyright: "© 2026 影策. All rights reserved."}
	migrateMengCengAppearance(&value)
	if value.BrandName != "梦层" || value.BrandSlug != "mengceng" {
		t.Fatal("built-in brand not migrated")
	}
	custom := AppearanceSetting{BrandName: "自定义", BrandSlug: "custom", LogoResourceID: "custom-logo", SkinID: "custom-skin", FooterCopyright: "自定义版权"}
	before, _ := json.Marshal(custom)
	migrateMengCengAppearance(&custom)
	after, _ := json.Marshal(custom)
	if string(before) != string(after) {
		t.Fatal("custom settings overwritten")
	}
}

func TestBrandSiteFailedPublicationRetainsPublic(t *testing.T) {
	s, db, _, admin := newAppearanceTestService(t)
	resource, err := s.UploadAppearanceAsset(admin, "brand-image", multipartFileHeader(t, "brand.png", "image/png", []byte{137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0}))
	if err != nil {
		t.Fatal(err)
	}
	content := defaultBrandSiteContent()
	content.HeroMedia = BrandSiteMedia{ResourceID: resource.ID, Kind: "image", Alt: "设计素材"}
	state, err := s.ChangeBrandSite(admin, "draft", BrandSiteChange{Content: content})
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Model(&model.Resource{}).Where("id = ?", resource.ID).Update("status", model.ResourceStatusFailed).Error; err != nil {
		t.Fatal(err)
	}
	if _, err = s.ChangeBrandSite(admin, "publish", BrandSiteChange{Revision: state.Revision}); err == nil {
		t.Fatal("failed resource published")
	}
	public, _ := s.PublicBrandSite()
	if public.HeroMedia.ResourceID != "" {
		t.Fatal("failed publication polluted public version")
	}
	loaded, _ := s.AdminBrandSite(admin)
	if loaded.Revision != state.Revision {
		t.Fatal("failed publish advanced revision")
	}
}

func TestBrandSiteRejectsBrokenStructure(t *testing.T) {
	s, _, _, admin := newAppearanceTestService(t)
	for name, change := range map[string]func(*BrandSiteContent){
		"null items":        func(c *BrandSiteContent) { c.Sections[0].Items = nil },
		"empty summary":     func(c *BrandSiteContent) { c.Sections[3].Items[0].Title = "" },
		"duplicate section": func(c *BrandSiteContent) { c.Sections[1].ID = c.Sections[0].ID },
		"wrong primary":     func(c *BrandSiteContent) { c.PrimaryLink = "/" },
		"relative host":     func(c *BrandSiteContent) { c.Sections[1].Items[0].Link = "//example.com" },
		"credential URL":    func(c *BrandSiteContent) { c.Sections[1].Items[0].Link = "https://name:secret@example.com" },
	} {
		t.Run(name, func(t *testing.T) {
			c := defaultBrandSiteContent()
			change(&c)
			if _, err := s.ChangeBrandSite(admin, "draft", BrandSiteChange{Content: c}); err == nil {
				t.Fatal("invalid structure accepted")
			}
		})
	}
	state, err := s.AdminBrandSite(admin)
	if err != nil || state.Revision != 0 {
		t.Fatal("invalid writes changed state", err)
	}
}
