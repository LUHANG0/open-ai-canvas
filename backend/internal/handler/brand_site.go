package handler

import (
	"github.com/gin-gonic/gin"
	"net/http"
	"yingce/backend/internal/model"
	"yingce/backend/internal/service"
)

func registerBrandSiteRoutes(r *gin.RouterGroup, svc *service.Service) {
	r.GET("/public/brand-site", func(c *gin.Context) {
		value, err := svc.PublicBrandSite()
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"content": value})
	})
	r.GET("/admin/settings/brand-site", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		value, err := svc.AdminBrandSite(actor)
		if err != nil {
			failService(c, err)
			return
		}
		c.Header("Cache-Control", "no-store")
		ok(c, gin.H{"setting": value})
	})
	r.POST("/admin/settings/brand-site/:action", func(c *gin.Context) {
		actor, err := currentUser(c, svc)
		if err != nil {
			failService(c, err)
			return
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 128<<10)
		var input service.BrandSiteChange
		if err = c.ShouldBindJSON(&input); err != nil {
			fail(c, 400, err)
			return
		}
		value, err := svc.ChangeBrandSite(actor, c.Param("action"), input)
		if err != nil {
			failService(c, err)
			return
		}
		ok(c, gin.H{"setting": value})
	})
	serve := func(admin bool) gin.HandlerFunc {
		return func(c *gin.Context) {
			var actor *model.User
			if admin {
				var err error
				actor, err = currentUser(c, svc)
				if err != nil {
					failService(c, err)
					return
				}
			}
			delivery, err := svc.PrepareBrandSiteMedia(actor, c.Param("id"), resourceAccessOptions(c), c.GetHeader("Range"))
			if err != nil {
				failService(c, err)
				return
			}
			serveResourceDelivery(c, delivery, "private, no-store", "")
		}
	}
	r.GET("/public/brand-site/media/:id", serve(false))
	r.GET("/admin/settings/brand-site/media/:id", serve(true))
}
