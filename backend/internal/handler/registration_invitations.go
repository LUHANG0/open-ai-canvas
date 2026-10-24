package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/service"
)

// Public invitation values stay in bounded JSON bodies, never API URLs or audit
// metadata. Rate-limit subjects use irreversible hashes rather than usable codes.
func invitationRequestLimit(c *gin.Context, action, code string) bool {
	limit := 30
	if action == "send" {
		limit = 10
	}
	if action == "submit" {
		limit = 10
	}
	return enforceRateLimit(c, "invitation:"+action+":ip:"+c.ClientIP(), limit, 10*time.Minute) &&
		enforceRateLimit(c, "invitation:"+action+":global", 300, time.Minute) &&
		enforceRateLimit(c, "invitation:"+action+":code:"+passwordResetRateLimitSubject(code), 30, time.Hour)
}

func registerRegistrationInvitationRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.POST("/auth/invitation/validate", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store")
		c.Header("Referrer-Policy", "no-referrer")
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1024)
		var req struct {
			Code string `json:"code"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, 400, err)
			return
		}
		if !invitationRequestLimit(c, "validate", req.Code) {
			return
		}
		result, err := svc.ValidateRegistrationInvitation(req.Code)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, result)
	})
	r.GET("/admin/registration-invitations", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		size, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
		if page < 1 || page > 100000 || size < 1 || size > 100 {
			fail(c, 400, service.BadAuthRequest("分页参数无效"))
			return
		}
		items, total, err := svc.ListRegistrationInvitations(actor, page, size)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"invitations": items, "total": total})
	})
	r.POST("/admin/registration-invitations", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err == nil {
			err = svc.RequireAdmin(actor)
		}
		if err != nil {
			failService(c, err)
			return
		}
		if !enforceRateLimit(c, "invitation-create:"+actor.ID, 100, time.Hour) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 4096)
		var req service.CreateRegistrationInvitationRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, 400, err)
			return
		}
		item, err := svc.CreateRegistrationInvitation(actor, req)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"invitation": item})
	})
	r.POST("/admin/registration-invitations/:id/revoke", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		if err := svc.RevokeRegistrationInvitation(actor, c.Param("id")); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"ok": true})
	})
}
