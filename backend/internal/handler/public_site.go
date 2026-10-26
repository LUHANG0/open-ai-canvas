package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"yingce/backend/internal/publicsite"
	"yingce/backend/internal/service"
)

func registerPublicSiteRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.Match([]string{http.MethodGet, http.MethodHead}, "/public/site/render", func(c *gin.Context) {
		catalog, err := publicsite.Default()
		if err != nil {
			failService(c, err)
			return
		}
		if _, ok := catalog.Get(c.Query("path")); !ok {
			c.Header("X-Robots-Tag", "noindex")
			c.Data(http.StatusNotFound, "text/html; charset=utf-8", []byte(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>页面不存在｜梦层</title><link rel="stylesheet" href="/api/public/site/assets/site.css"></head><body class="mc-public"><main class="frame"><h1>这一页还没有画面</h1><p>这个地址没有已发布的内容。</p><a href="/tutorials">阅读创作教程</a> · <a href="/">返回梦层首页</a></main></body></html>`))
			return
		}
		body, err := svc.PublicReadingPage(c.Query("path"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-cache, must-revalidate")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Data(200, "text/html; charset=utf-8", body)
	})
	r.Match([]string{http.MethodGet, http.MethodHead}, "/public/site/assets/:name", func(c *gin.Context) {
		b, ok := publicsite.Asset(c.Param("name"))
		if !ok {
			c.Status(404)
			return
		}
		kind := "text/css; charset=utf-8"
		if c.Param("name") == "site.js" {
			kind = "application/javascript; charset=utf-8"
		}
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Cache-Control", "public, max-age=3600")
		c.Data(200, kind, b)
	})
	r.Match([]string{http.MethodGet, http.MethodHead}, "/public/site/sitemap.xml", func(c *gin.Context) {
		b, err := svc.PublicSitemap()
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-cache, must-revalidate")
		c.Data(200, "application/xml; charset=utf-8", b)
	})
	r.Match([]string{http.MethodGet, http.MethodHead}, "/public/site/robots.txt", func(c *gin.Context) {
		b, err := svc.PublicRobots()
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-cache, must-revalidate")
		c.Data(200, "text/plain; charset=utf-8", b)
	})
	r.Match([]string{http.MethodGet, http.MethodHead}, "/public/site/indexnow-key", func(c *gin.Context) {
		key, err := svc.PublicIndexNowKey(c.Query("file"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-cache, must-revalidate")
		c.Data(200, "text/plain; charset=utf-8", []byte(key))
	})
	r.GET("/admin/settings/seo", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		v, err := svc.AdminSEOSettings(actor)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"setting": v})
	})
	r.PATCH("/admin/settings/seo", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		var input service.SEOSettingsRequest
		if err := c.ShouldBindJSON(&input); err != nil {
			fail(c, 400, err)
			return
		}
		v, err := svc.UpdateSEOSettings(actor, input)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"setting": v})
	})
	r.POST("/admin/settings/seo/check", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.RunSEOCheck(actor); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"scheduled": true})
	})
}
