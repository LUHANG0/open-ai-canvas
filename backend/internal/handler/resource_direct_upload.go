package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"time"
	"yingce/backend/internal/service"
)

func RegisterDirectUploadRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.POST("/resources/direct-uploads", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "resources-upload:"+user.ID, policy.Request.ResourceUploadPerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
		var req service.DirectUploadRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, err)
			return
		}
		result, err := svc.BeginDirectResourceUpload(user.ID, req, c.GetHeader("X-Idempotency-Key"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, result)
	})
	r.POST("/resources/direct-uploads/:id/complete", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "resources-complete:"+user.ID, policy.Request.ResourceUploadPerMinute*3, time.Minute) {
			return
		}
		resource, err := svc.CompleteDirectResourceUpload(user.ID, c.Param("id"))
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"resource": resource})
	})
}
