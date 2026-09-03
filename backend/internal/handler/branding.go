package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func RegisterBrandingRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/public/branding", func(c *gin.Context) {
		setting, err := svc.PublicBranding()
		if err != nil {
			failService(c, err)
			return
		}
		etag := fmt.Sprintf(`"branding-%d"`, setting.Revision)
		c.Header("Cache-Control", "public, no-cache")
		c.Header("ETag", etag)
		if strings.TrimSpace(c.GetHeader("If-None-Match")) == etag {
			c.Status(http.StatusNotModified)
			return
		}
		ok(c, setting)
	})

	r.GET("/public/branding/assets/:slot", func(c *gin.Context) {
		stream, err := svc.OpenBrandAsset(c.Param("slot"), c.GetHeader("Range"))
		if err != nil {
			failService(c, err)
			return
		}
		defer stream.Body.Close()
		mimeType := strings.TrimSpace(stream.Resource.MimeType)
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("Accept-Ranges", stream.AcceptRanges)
		if stream.ContentRange != "" {
			c.Header("Content-Range", stream.ContentRange)
		}
		c.DataFromReader(stream.StatusCode, stream.ContentLength, mimeType, stream.Body, nil)
	})

	r.GET("/admin/settings/branding", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		setting, err := svc.AdminBranding(user)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.PATCH("/admin/settings/branding", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 32<<10)
		var req service.UpdateBrandingRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.UpdateBranding(user, req)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.POST("/admin/settings/branding/assets/:slot", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "admin-brand-asset-upload:"+user.ID, policy.Request.ResourceUploadPerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (40<<20)+(1<<20))
		expectedRevision, err := strconv.ParseInt(strings.TrimSpace(c.PostForm("expectedRevision")), 10, 64)
		if err != nil || expectedRevision < 0 {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("品牌配置修订号无效"))
			return
		}
		file, err := c.FormFile("file")
		if err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.UploadBrandAsset(user, c.Param("slot"), expectedRevision, file)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.DELETE("/admin/settings/branding/assets/:slot", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		expectedRevision, err := strconv.ParseInt(strings.TrimSpace(c.Query("expectedRevision")), 10, 64)
		if err != nil || expectedRevision < 0 {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("品牌配置修订号无效"))
			return
		}
		setting, err := svc.ClearBrandAsset(user, c.Param("slot"), expectedRevision)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})

	r.POST("/admin/settings/branding/reset", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 8<<10)
		var req struct {
			ExpectedRevision int64 `json:"expectedRevision"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		setting, err := svc.ResetBranding(user, req.ExpectedRevision)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": setting})
	})
}
