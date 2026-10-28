package handler

import (
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
	"yingce/backend/internal/service"
)

func TestLocalMediaDownloadResponsePreservesAttachmentName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, mimeType := range []string{"image/png", "video/mp4", "audio/wav"} {
		t.Run(mimeType, func(t *testing.T) {
			router := gin.New()
			router.GET("/file/:filename", func(c *gin.Context) {
				options := resourceAccessOptions(c)
				if options.Purpose != assets.PurposeDownload || options.DownloadName != "画布_镜头01.png" {
					t.Errorf("download options = %#v", options)
				}
				r := &model.Resource{ID: "file", MimeType: mimeType}
				serveResourceDelivery(c, &service.ResourceDelivery{Resource: r, Access: &assets.ResourceAccess{Delivery: assets.DeliveryLocal}, Stream: &service.ResourceStream{Resource: r, Body: io.NopCloser(strings.NewReader("content")), StatusCode: 200, ContentLength: 7}}, "public, max-age=0, must-revalidate", "")
			})
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/file/"+url.PathEscape("画布_镜头01.png")+"?purpose=download", nil))
			kind, params, err := mime.ParseMediaType(w.Header().Get("Content-Disposition"))
			if err != nil || kind != "attachment" || params["filename"] != "画布_镜头01.png" {
				t.Fatalf("download disposition = %q", w.Header().Get("Content-Disposition"))
			}
			if w.Code != 200 || w.Body.String() != "content" || w.Header().Get("Content-Type") != mimeType || w.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatalf("download response = %d %#v", w.Code, w.Header())
			}
		})
	}
}

func TestNonMediaDeliveryAttachment(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, mimeType := range []string{"text/html", "image/svg+xml", "application/pdf", "application/octet-stream", "image/png"} {
		t.Run(mimeType, func(t *testing.T) {
			router := gin.New()
			router.GET("/file", func(c *gin.Context) {
				r := &model.Resource{ID: "file", MimeType: mimeType}
				serveResourceDelivery(c, &service.ResourceDelivery{Resource: r, Access: &assets.ResourceAccess{Delivery: assets.DeliveryLocal}, Stream: &service.ResourceStream{Resource: r, Body: io.NopCloser(strings.NewReader("content")), StatusCode: 200, ContentLength: 7}}, "", "inline")
			})
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/file", nil))
			if w.Code != 200 {
				t.Fatalf("status=%d", w.Code)
			}
			if mimeType == "image/png" {
				if w.Header().Get("Content-Disposition") != "inline" {
					t.Fatal("media no longer inline")
				}
			} else if !strings.HasPrefix(w.Header().Get("Content-Disposition"), "attachment") || !strings.Contains(w.Header().Get("Content-Security-Policy"), "sandbox") {
				t.Fatalf("unsafe non-media headers: %v", w.Header())
			}
		})
	}
}
