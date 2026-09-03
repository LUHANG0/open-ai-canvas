package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"infinite-canvas/backend/internal/service"

	"github.com/gin-gonic/gin"
)

func registerCreationConversationRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/creation-conversations", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		conversations, err := svc.CreationConversations(user.ID)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"conversations": conversations})
	})
	r.PUT("/creation-conversations/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		policy, available := loadRuntimePolicy(c, svc)
		if !available || !enforceRateLimit(c, "creation-conversations-write:"+user.ID, policy.Request.CanvasWritePerMinute, time.Minute) {
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, (2<<20)+(64<<10))
		var req struct {
			Conversation     json.RawMessage `json:"conversation"`
			ExpectedRevision int64           `json:"expectedRevision"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("创作对话请求格式无效"))
			return
		}
		var identity struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(req.Conversation, &identity) != nil || identity.ID != c.Param("id") {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("创作对话 ID 与请求路径不一致"))
			return
		}
		record, err := svc.UpsertCreationConversation(user.ID, req.Conversation, req.ExpectedRevision)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"record": record})
	})
	r.DELETE("/creation-conversations/:id", func(c *gin.Context) {
		user, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		revision, err := strconv.ParseInt(c.Query("revision"), 10, 64)
		if err != nil || revision <= 0 {
			fail(c, http.StatusBadRequest, service.BadAuthRequest("删除创作对话需要有效版本"))
			return
		}
		if err := svc.DeleteCreationConversation(user.ID, c.Param("id"), revision); err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"id": c.Param("id")})
	})
}
