package app

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strings"
	"time"

	"gorm.io/gorm"
	"yingce/backend/internal/model"
	"yingce/backend/internal/outbound"
	"yingce/backend/internal/publicsite"
)

const seoSettingsKey = "seo_publication"
const seoStateKey = "seo_submission_state"

type seoSettings struct {
	Revision                int64  `json:"revision"`
	Enabled                 bool   `json:"enabled"`
	BaiduAllowHTTP          bool   `json:"baiduAllowHTTP"`
	BaiduEnabled            bool   `json:"baiduEnabled"`
	IndexNowEnabled         bool   `json:"indexNowEnabled"`
	GoogleSitemapRegistered bool   `json:"googleSitemapRegistered"`
	BaiduToken              string `json:"baiduToken"`
	IndexNowKey             string `json:"indexNowKey"`
}
type SEOSettingsRequest struct {
	Revision                int64  `json:"revision"`
	Enabled                 bool   `json:"enabled"`
	BaiduAllowHTTP          bool   `json:"baiduAllowHTTP"`
	BaiduEnabled            bool   `json:"baiduEnabled"`
	IndexNowEnabled         bool   `json:"indexNowEnabled"`
	GoogleSitemapRegistered bool   `json:"googleSitemapRegistered"`
	BaiduToken              string `json:"baiduToken"`
	ClearBaiduToken         bool   `json:"clearBaiduToken"`
}
type SEOSettingsView struct {
	Revision                int64                `json:"revision"`
	Enabled                 bool                 `json:"enabled"`
	BaiduAllowHTTP          bool                 `json:"baiduAllowHTTP"`
	BaiduEnabled            bool                 `json:"baiduEnabled"`
	IndexNowEnabled         bool                 `json:"indexNowEnabled"`
	GoogleSitemapRegistered bool                 `json:"googleSitemapRegistered"`
	HasBaiduToken           bool                 `json:"hasBaiduToken"`
	HasIndexNowKey          bool                 `json:"hasIndexNowKey"`
	Origin                  string               `json:"origin"`
	Pages                   []publicsite.Entry   `json:"pages"`
	Jobs                    []publicsite.Job     `json:"jobs"`
	ProviderNotBefore       map[string]time.Time `json:"providerNotBefore"`
}

func (s *Service) publicSiteOrigin() (string, error) {
	return publicsite.Origin(os.Getenv("CANVAS_PUBLIC_BASE_URL"))
}
func (s *Service) PublicReadingPage(path string) ([]byte, error) {
	c, err := publicsite.Default()
	if err != nil {
		return nil, err
	}
	p, ok := c.Get(path)
	if !ok {
		return nil, NotFound("公开页面不存在")
	}
	origin, err := s.publicSiteOrigin()
	if err != nil {
		return nil, err
	}
	appearance, err := s.Appearance()
	if err != nil {
		return nil, err
	}
	return c.Render(p, origin, appearance.BrandName)
}
func (s *Service) publicSiteEntries() ([]publicsite.Entry, error) {
	c, err := publicsite.Default()
	if err != nil {
		return nil, err
	}
	origin, err := s.publicSiteOrigin()
	if err != nil {
		return nil, err
	}
	_, state, err := s.readBrandSite()
	if err != nil {
		return nil, err
	}
	content := publicBrandSiteContent(state.Published)
	a, err := s.Appearance()
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(struct {
		Content                   BrandSiteContent
		Title, Description, Brand string
	}{content, a.SEOTitle, a.SEODescription, a.BrandName})
	h := sha256.Sum256(b)
	updated := a.UpdatedAt
	if state.PublishedAt != nil && state.PublishedAt.After(updated) {
		updated = *state.PublishedAt
	}
	entries := []publicsite.Entry{{URL: origin + "/", Revision: hex.EncodeToString(h[:]), UpdatedAt: updated}}
	for _, e := range c.Entries(origin) {
		v := sha256.Sum256([]byte(e.Revision + "\n" + a.BrandName))
		e.Revision = hex.EncodeToString(v[:])
		if a.UpdatedAt.After(e.UpdatedAt) {
			e.UpdatedAt = a.UpdatedAt
		}
		entries = append(entries, e)
	}
	return entries, nil
}
func (s *Service) PublicSitemap() ([]byte, error) {
	entries, err := s.publicSiteEntries()
	if err != nil {
		return nil, err
	}
	return publicsite.Sitemap(entries)
}
func (s *Service) PublicRobots() ([]byte, error) {
	origin, err := s.publicSiteOrigin()
	if err != nil {
		return nil, err
	}
	return []byte("User-agent: *\nAllow: /\n\nSitemap: " + origin + "/sitemap.xml\n"), nil
}
func (s *Service) readSEOSettings() (*model.SystemSetting, seoSettings, error) {
	value := seoSettings{BaiduEnabled: true, IndexNowEnabled: true}
	row, err := s.repo.SystemSetting(seoSettingsKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, value, nil
	}
	if err != nil {
		return nil, value, err
	}
	if json.Unmarshal([]byte(row.ValueJSON), &value) != nil {
		return nil, value, errors.New("SEO 配置无法读取")
	}
	value.BaiduToken, err = s.decryptSettingSecret(value.BaiduToken)
	if err != nil {
		return nil, value, errors.New("SEO 凭据无法读取")
	}
	value.IndexNowKey, err = s.decryptSettingSecret(value.IndexNowKey)
	if err != nil {
		return nil, value, errors.New("SEO 凭据无法读取")
	}
	return row, value, nil
}
func (s *Service) readSEOState() (*model.SystemSetting, publicsite.SubmissionState, error) {
	var state publicsite.SubmissionState
	row, err := s.repo.SystemSetting(seoStateKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, state, nil
	}
	if err != nil {
		return nil, state, err
	}
	if len(row.ValueJSON) > 4<<20 || json.Unmarshal([]byte(row.ValueJSON), &state) != nil {
		return nil, state, errors.New("收录队列无法读取")
	}
	return row, state, nil
}
func (s *Service) updateSEOState(change func(*publicsite.SubmissionState)) error {
	for attempt := 0; attempt < 8; attempt++ {
		old, state, err := s.readSEOState()
		if err != nil {
			return err
		}
		change(&state)
		b, err := json.Marshal(state)
		if err != nil {
			return err
		}
		if len(b) > 4<<20 {
			return errors.New("收录队列超过容量")
		}
		if old != nil && string(b) == old.ValueJSON {
			return nil
		}
		next := &model.SystemSetting{Key: seoStateKey, ValueJSON: string(b), UpdatedBy: "system:seo"}
		if old != nil {
			next.CreatedAt = old.CreatedAt
		}
		ok, err := s.repo.CompareAndSwapSystemSetting(next, old)
		if err != nil {
			return err
		}
		if ok {
			return nil
		}
	}
	return NewAppError(http.StatusConflict, "收录队列正在更新，请稍后重试")
}
func (s *Service) AdminSEOSettings(actor *model.User) (*SEOSettingsView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	_, v, err := s.readSEOSettings()
	if err != nil {
		return nil, err
	}
	_, state, err := s.readSEOState()
	if err != nil {
		return nil, err
	}
	origin, _ := s.publicSiteOrigin()
	entries, err := s.publicSiteEntries()
	if err != nil && origin != "" {
		return nil, err
	}
	jobs := append([]publicsite.Job(nil), state.Jobs...)
	for i := range jobs {
		jobs[i].LeaseToken = ""
	}
	return &SEOSettingsView{Revision: v.Revision, Enabled: v.Enabled, BaiduEnabled: v.BaiduEnabled, BaiduAllowHTTP: v.BaiduAllowHTTP, IndexNowEnabled: v.IndexNowEnabled, GoogleSitemapRegistered: v.GoogleSitemapRegistered, HasBaiduToken: v.BaiduToken != "", HasIndexNowKey: v.IndexNowKey != "", Origin: origin, Pages: entries, Jobs: jobs, ProviderNotBefore: state.ProviderNotBefore}, nil
}

var baiduTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,256}$`)

func (s *Service) UpdateSEOSettings(actor *model.User, input SEOSettingsRequest) (*SEOSettingsView, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	old, v, err := s.readSEOSettings()
	if err != nil {
		return nil, err
	}
	if input.Revision != v.Revision {
		return nil, NewAppError(http.StatusConflict, "SEO 配置已变化，请刷新后重试")
	}
	if input.ClearBaiduToken && input.BaiduToken != "" {
		return nil, BadAuthRequest("不能同时清除和填写推送密钥")
	}
	if input.BaiduToken != "" && !baiduTokenPattern.MatchString(input.BaiduToken) {
		return nil, BadAuthRequest("百度推送密钥格式无效")
	}
	if input.Enabled {
		origin, err := s.publicSiteOrigin()
		if err != nil {
			return nil, err
		}
		u, _ := url.Parse(origin)
		if u.Scheme != "https" || strings.EqualFold(u.Hostname(), "localhost") || net.ParseIP(u.Hostname()) != nil {
			return nil, BadAuthRequest("自动提交需要配置 HTTPS 公网域名")
		}
	}
	v.Revision++
	v.Enabled = input.Enabled
	v.BaiduEnabled = input.BaiduEnabled
	v.BaiduAllowHTTP = input.BaiduAllowHTTP
	v.IndexNowEnabled = input.IndexNowEnabled
	v.GoogleSitemapRegistered = input.GoogleSitemapRegistered
	if input.ClearBaiduToken {
		v.BaiduToken = ""
	}
	if input.BaiduToken != "" {
		v.BaiduToken = input.BaiduToken
	}
	if v.Enabled && v.IndexNowEnabled && v.IndexNowKey == "" {
		var key [16]byte
		if _, err := rand.Read(key[:]); err != nil {
			return nil, err
		}
		v.IndexNowKey = hex.EncodeToString(key[:])
	}
	stored := v
	stored.BaiduToken, err = s.encryptSettingSecret(v.BaiduToken)
	if err != nil {
		return nil, err
	}
	stored.IndexNowKey, err = s.encryptSettingSecret(v.IndexNowKey)
	if err != nil {
		return nil, err
	}
	b, _ := json.Marshal(stored)
	next := &model.SystemSetting{Key: seoSettingsKey, ValueJSON: string(b), UpdatedBy: actor.ID}
	if old != nil {
		next.CreatedAt = old.CreatedAt
	}
	metadata, _ := json.Marshal(map[string]any{"revision": v.Revision, "enabled": v.Enabled, "baiduEnabled": v.BaiduEnabled, "baiduAllowHTTP": v.BaiduAllowHTTP, "indexNowEnabled": v.IndexNowEnabled, "hasBaiduToken": v.BaiduToken != ""})
	event := &model.AdminAuditEvent{ID: newID(), ActorUserID: actor.ID, Action: "seo.configure", TargetType: "system_setting", TargetID: seoSettingsKey, Summary: "更新公开页面自动收录配置", MetadataJSON: string(metadata), CreatedAt: time.Now()}
	swapped, err := s.repo.CompareAndSwapSEOSettings(next, old, event)
	if err != nil {
		return nil, err
	}
	if !swapped {
		return nil, NewAppError(http.StatusConflict, "SEO 配置已变化，请刷新后重试")
	}
	return s.AdminSEOSettings(actor)
}
func (s *Service) PublicIndexNowKey(filename string) (string, error) {
	_, v, err := s.readSEOSettings()
	if err != nil {
		return "", err
	}
	if v.IndexNowKey == "" || filename != "/"+v.IndexNowKey+".txt" {
		return "", NotFound("验证文件不存在")
	}
	return v.IndexNowKey, nil
}
func (s *Service) RunSEOCheck(actor *model.User) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	if !s.runWorkerTask(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
		defer cancel()
		if err := s.processSEO(ctx, outbound.OutboundHTTPClient(20*time.Second)); err != nil {
			slog.Warn("SEO submission check failed")
		}
	}) {
		return NewAppError(http.StatusConflict, "服务正在停止，请稍后重试")
	}
	return nil
}
func (s *Service) startSEOWorker(ctx context.Context) {
	s.runWorkerLoop(func(ctx context.Context) {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			if err := s.processSEO(ctx, outbound.OutboundHTTPClient(20*time.Second)); err != nil && !errors.Is(err, context.Canceled) {
				slog.Warn("SEO submission check failed")
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	})
}
func (s *Service) processSEO(ctx context.Context, client *http.Client) error {
	_, cfg, err := s.readSEOSettings()
	if err != nil {
		return err
	}
	if !cfg.Enabled {
		return nil
	}
	entries, err := s.publicSiteEntries()
	if err != nil {
		return err
	}
	origin, err := s.publicSiteOrigin()
	if err != nil {
		return err
	}
	providers := []string{}
	if cfg.BaiduEnabled {
		providers = append(providers, "baidu")
	}
	if cfg.IndexNowEnabled {
		providers = append(providers, "indexnow")
	}
	for n := 0; n < 10; n++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		// Re-read before each claim so disabling or changing credentials takes
		// effect without waiting for the next scan. Never reset accepted jobs.
		_, latest, err := s.readSEOSettings()
		if err != nil {
			return err
		}
		if !latest.Enabled || latest.Revision != cfg.Revision {
			return nil
		}
		var claimed *publicsite.Job
		token := newID()
		now := time.Now()
		err = s.updateSEOState(func(state *publicsite.SubmissionState) {
			claimed = nil
			state.Sync(entries, providers, cfg.Revision, now)
			claimed = state.Claim(now, token)
		})
		if err != nil {
			return err
		}
		if claimed == nil {
			return nil
		}
		result := publicsite.Send(ctx, client, *claimed, origin, cfg.BaiduToken, cfg.IndexNowKey, time.Now(), publicsite.SendOptions{AllowBaiduHTTP: cfg.BaiduAllowHTTP})
		if err := s.updateSEOState(func(state *publicsite.SubmissionState) { state.Complete(claimed.ID, token, result, time.Now()) }); err != nil {
			return err
		}
	}
	return nil
}
