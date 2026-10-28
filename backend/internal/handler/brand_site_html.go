package handler

import (
	"bytes"
	"encoding/json"
	"html/template"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/publicsite"
	"yingce/backend/internal/service"
)

// These fragments are also readable without JavaScript. They use the same
// public services as the browser, so unpublished and hidden content stays private.
var brandHeadHTML = template.Must(template.New("head").Parse(`<title>{{.SEOTitle}}</title>
<meta name="description" content="{{.SEODescription}}">
<meta property="og:title" content="{{.SEOTitle}}">
<meta property="og:description" content="{{.SEODescription}}">
<meta property="og:site_name" content="{{.BrandName}}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="{{.SEOTitle}}">
<meta name="twitter:description" content="{{.SEODescription}}">
<link rel="icon" href="{{.Favicon}}"{{if not .LogoConfigured}} type="image/png" sizes="192x192"{{end}}>
{{if .SiteSchema}}<script type="application/ld+json">{{.SiteSchema}}</script>{{end}}`))

type brandHeadView struct {
	*service.PublicAppearanceSetting
	Favicon    string
	SiteSchema template.JS
}

func newBrandHeadView(appearance *service.PublicAppearanceSetting, baseURL string) brandHeadView {
	view := brandHeadView{PublicAppearanceSetting: appearance, Favicon: "/favicon.png"}
	if appearance.LogoConfigured {
		view.Favicon = appearance.LogoURL
	}
	// The configured public origin is authoritative; never publish a request Host
	// header or a fabricated domain in the site's identity.
	origin, err := publicsite.Origin(baseURL)
	if err != nil {
		return view
	}
	website := map[string]any{
		"@context": "https://schema.org", "@type": "WebSite",
		"@id": origin + "/#website", "url": origin + "/", "name": appearance.BrandName,
	}
	if appearance.BrandName == "梦层" && appearance.BrandSlug == "mengceng" {
		website["alternateName"] = []string{"MengCeng", "梦层 MengCeng"}
	}
	// encoding/json escapes HTML delimiters, including </script> in admin copy.
	// Only that serialized JSON is trusted as JavaScript by html/template.
	encoded, _ := json.Marshal(website)
	view.SiteSchema = template.JS(encoded)
	return view
}

var brandBodyHTML = template.Must(template.New("body").Parse(`<main id="mengceng-main">
<h1>{{.Title}}</h1><p>{{.Description}}</p>{{if .Detail}}<p>{{.Detail}}</p>{{end}}
<a href="/login">{{.PrimaryLabel}}</a>
<nav aria-label="公开内容"><a href="/features">功能详解</a> · <a href="/features/canvas">AI 无限画布</a> · <a href="/tutorials">创作教程</a> · <a href="/tutorials/infinite-canvas">无限画布入门</a></nav>
{{range .Sections}}<section><h2>{{.Title}}</h2>{{if .Description}}<p>{{.Description}}</p>{{end}}
{{range .Items}}<article><h3>{{.Title}}</h3>{{if .Description}}<p>{{.Description}}</p>{{end}}</article>{{end}}
</section>{{end}}
</main>`))

func registerBrandSiteHTMLRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/public/brand-site/html/head", func(c *gin.Context) {
		value, err := svc.Appearance()
		if err != nil {
			failService(c, err)
			return
		}
		serveBrandHTML(c, brandHeadHTML, newBrandHeadView(value, os.Getenv("CANVAS_PUBLIC_BASE_URL")))
	})
	r.GET("/public/brand-site/html/body", func(c *gin.Context) {
		value, err := svc.PublicBrandSite()
		if err != nil {
			failService(c, err)
			return
		}
		serveBrandHTML(c, brandBodyHTML, value)
	})
}

func serveBrandHTML(c *gin.Context, view *template.Template, value any) {
	var body bytes.Buffer
	if err := view.Execute(&body, value); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(http.StatusOK, "text/html; charset=utf-8", body.Bytes())
}
