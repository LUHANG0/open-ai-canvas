package handler

import (
	"encoding/json"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
	"yingce/backend/internal/service"
)

func TestBrandSiteHTMLPublicationAndEscaping(t *testing.T) {
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "https://mengceng.com")
	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	raw.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = raw.Close() })
	if err := db.AutoMigrate(&model.SystemSetting{}, &model.AdminAuditEvent{}); err != nil {
		t.Fatal(err)
	}
	svc := service.New(repository.New(db), t.TempDir())
	admin := &model.User{ID: "seo-admin", Role: model.UserRoleAdmin}
	state, err := svc.AdminBrandSite(admin)
	if err != nil {
		t.Fatal(err)
	}
	draft := state.Draft
	draft.Title = `published <script>alert("x")</script>`
	draft.Sections[0].Visible = false
	draft.Sections[0].Title = "hidden-seo-sentinel"
	state, err = svc.ChangeBrandSite(admin, "draft", service.BrandSiteChange{Revision: state.Revision, Content: draft})
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	registerBrandSiteRoutes(router.Group("/api"), svc)
	get := func(path string) string {
		t.Helper()
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest("GET", path, nil))
		if response.Code != 200 || response.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(response.Header().Get("Content-Type"), "text/html") {
			t.Fatalf("HTML response: %d %v %s", response.Code, response.Header(), response.Body.String())
		}
		return response.Body.String()
	}
	body := get("/api/public/brand-site/html/body")
	head := get("/api/public/brand-site/html/head")
	if !strings.Contains(head, `rel="icon" href="/favicon.png" type="image/png" sizes="192x192"`) {
		t.Fatalf("missing crawlable PNG favicon: %s", head)
	}
	decodeWebsite := func(head string) map[string]any {
		t.Helper()
		blocks := regexp.MustCompile(`<script type="application/ld\+json">(.*?)</script>`).FindAllStringSubmatch(head, -1)
		if len(blocks) != 1 {
			t.Fatalf("expected one site identity block: %s", head)
		}
		var site map[string]any
		if err := json.Unmarshal([]byte(blocks[0][1]), &site); err != nil {
			t.Fatal(err)
		}
		return site
	}
	site := decodeWebsite(head)
	if site["@type"] != "WebSite" || site["name"] != "梦层" || site["url"] != "https://mengceng.com/" || site["@id"] != "https://mengceng.com/#website" {
		t.Fatalf("incorrect primary site identity: %#v", site)
	}
	aliases, _ := site["alternateName"].([]any)
	if len(aliases) != 2 || aliases[0] != "MengCeng" || aliases[1] != "梦层 MengCeng" {
		t.Fatalf("incorrect brand aliases: %#v", aliases)
	}
	if strings.Contains(body, "published") || strings.Contains(body, "hidden-seo-sentinel") {
		t.Fatal("draft leaked")
	}
	state, err = svc.ChangeBrandSite(admin, "publish", service.BrandSiteChange{Revision: state.Revision})
	if err != nil {
		t.Fatal(err)
	}
	body = get("/api/public/brand-site/html/body")
	if !strings.Contains(body, "published &lt;script&gt;") || strings.Contains(body, "<script>") || strings.Contains(body, "hidden-seo-sentinel") {
		t.Fatalf("escaped publication boundary: %s", body)
	}
	draft.Title = "unpublished-new-seo-sentinel"
	state, err = svc.ChangeBrandSite(admin, "draft", service.BrandSiteChange{Revision: state.Revision, Content: draft})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(get("/api/public/brand-site/html/body"), draft.Title) {
		t.Fatal("new draft leaked")
	}
	_, err = svc.ChangeBrandSite(admin, "restore", service.BrandSiteChange{Revision: state.Revision})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(get("/api/public/brand-site/html/body"), "published") {
		t.Fatal("restored publication not reflected")
	}

	appearance, err := svc.AdminAppearance(admin)
	if err != nil {
		t.Fatal(err)
	}
	appearance.SEOTitle = `SEO <script>test</script>`
	appearance.SEODescription = `safe " description <img src=x onerror=alert(1)>`
	if _, err := svc.UpdateAppearance(admin, appearance.AppearanceSetting); err != nil {
		t.Fatal(err)
	}
	head = get("/api/public/brand-site/html/head")
	if !strings.Contains(head, "SEO &lt;script&gt;") || !strings.Contains(head, "&#34;") || strings.Contains(head, "<script>") || strings.Contains(head, "<img") {
		t.Fatalf("unsafe metadata: %s", head)
	}
	// A renamed deployment must not inherit MengCeng aliases. JSON must roundtrip
	// authored text without allowing it to terminate the structured-data script.
	appearance.BrandName = `品牌 </script><img src=x>`
	appearance.BrandSlug = "custom-brand"
	if _, err := svc.UpdateAppearance(admin, appearance.AppearanceSetting); err != nil {
		t.Fatal(err)
	}
	head = get("/api/public/brand-site/html/head")
	site = decodeWebsite(head)
	if site["name"] != appearance.BrandName || site["alternateName"] != nil || strings.Contains(head, "</script><img") {
		t.Fatalf("custom brand boundary: %s", head)
	}
	t.Setenv("CANVAS_PUBLIC_BASE_URL", "")
	head = get("/api/public/brand-site/html/head")
	if strings.Contains(head, "application/ld+json") || !strings.Contains(head, "/favicon.png") {
		t.Fatalf("unconfigured origin must omit identity without losing metadata: %s", head)
	}
}
