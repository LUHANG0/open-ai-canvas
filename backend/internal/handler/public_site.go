package handler

import (
	"fmt"
	"net/http"
	"strings"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func RegisterPublicSiteRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/public/site", func(c *gin.Context) {
		setting, err := svc.PublicSite()
		if err != nil {
			failService(c, err)
			return
		}
		etag := fmt.Sprintf(`"public-site-%d"`, setting.Revision)
		c.Header("Cache-Control", "public, no-cache")
		c.Header("ETag", etag)
		if strings.TrimSpace(c.GetHeader("If-None-Match")) == etag {
			c.Status(http.StatusNotModified)
			return
		}
		ok(c, setting)
	})

	r.GET("/admin/settings/public-site", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		setting, err := svc.AdminPublicSite(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.PATCH("/admin/settings/public-site", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10)
		var req service.UpdatePublicSiteRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.UpdatePublicSiteDraft(user, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.POST("/admin/settings/public-site/publish", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			ExpectedRevision int64 `json:"expectedRevision"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.PublishPublicSite(user, req.ExpectedRevision)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.POST("/admin/settings/public-site/reset", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		var req struct {
			ExpectedRevision int64 `json:"expectedRevision"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.ResetPublicSiteDraft(user, req.ExpectedRevision)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})
}
