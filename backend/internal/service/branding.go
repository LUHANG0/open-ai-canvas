package service

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

const brandingSettingKey = "platform_branding"

const (
	BrandAssetLogo           = "logo"
	BrandAssetFavicon        = "favicon"
	BrandAssetAuthHero       = "auth-hero"
	BrandAssetAuthHeroPoster = "auth-hero-poster"
)

const (
	brandLogoMaxBytes       int64 = 2 << 20
	brandFaviconMaxBytes    int64 = 512 << 10
	brandHeroMaxBytes       int64 = 40 << 20
	brandHeroPosterMaxBytes int64 = 8 << 20
)

var brandHexColorPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

type BrandingIdentity struct {
	DisplayName    string `json:"displayName"`
	ShortName      string `json:"shortName"`
	EnglishName    string `json:"englishName"`
	WorkspaceLabel string `json:"workspaceLabel"`
	Slogan         string `json:"slogan"`
	Description    string `json:"description"`
}

type BrandingTheme struct {
	PrimaryColor string `json:"primaryColor"`
}

type BrandingAuth struct {
	Eyebrow       string `json:"eyebrow"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	LiveBadge     string `json:"liveBadge"`
	HeroURL       string `json:"heroUrl"`
	HeroKind      string `json:"heroKind"`
	HeroPosterURL string `json:"heroPosterUrl"`
}

type BrandingBrowser struct {
	Title           string `json:"title"`
	MetaDescription string `json:"metaDescription"`
}

type BrandingConfig struct {
	Identity BrandingIdentity `json:"identity"`
	Theme    BrandingTheme    `json:"theme"`
	Auth     BrandingAuth     `json:"auth"`
	Browser  BrandingBrowser  `json:"browser"`
}

type BrandingAssetReferences struct {
	LogoResourceID           string `json:"logoResourceId"`
	FaviconResourceID        string `json:"faviconResourceId"`
	AuthHeroResourceID       string `json:"authHeroResourceId"`
	AuthHeroPosterResourceID string `json:"authHeroPosterResourceId"`
}

type BrandingAssetURLs struct {
	LogoURL           string `json:"logoUrl"`
	FaviconURL        string `json:"faviconUrl"`
	AuthHeroURL       string `json:"authHeroUrl"`
	AuthHeroPosterURL string `json:"authHeroPosterUrl"`
	AuthHeroKind      string `json:"authHeroKind"`
}

type PublicBrandingSetting struct {
	Revision int64             `json:"revision"`
	Config   BrandingConfig    `json:"config"`
	Assets   BrandingAssetURLs `json:"assets"`
}

type AdminBrandingSetting struct {
	PublicBrandingSetting
	AssetReferences BrandingAssetReferences `json:"assetReferences"`
	Configured      bool                    `json:"configured"`
	UpdatedBy       string                  `json:"updatedBy"`
	CreatedAt       *time.Time              `json:"createdAt,omitempty"`
	UpdatedAt       *time.Time              `json:"updatedAt,omitempty"`
}

type UpdateBrandingRequest struct {
	ExpectedRevision int64          `json:"expectedRevision"`
	Config           BrandingConfig `json:"config"`
}

type brandingSettingValue struct {
	Revision int64                   `json:"revision"`
	Config   BrandingConfig          `json:"config"`
	Assets   BrandingAssetReferences `json:"assets"`
}

func DefaultBrandingConfig() BrandingConfig {
	return BrandingConfig{
		Identity: BrandingIdentity{
			DisplayName:    "影策",
			ShortName:      "影策",
			EnglishName:    "YINGCE STUDIO",
			WorkspaceLabel: "创作工作台",
			Slogan:         "让故事开机。",
			Description:    "面向 AI 影视与短剧创作的开源工作台。",
		},
		Theme: BrandingTheme{PrimaryColor: "#8B7CF6"},
		Auth: BrandingAuth{
			Eyebrow:     "YINGCE STUDIO",
			Title:       "让故事开机。",
			Description: "从剧本、角色、分镜到成片，在一个工作台完成。",
			LiveBadge:   "创作正在发生",
		},
		Browser: BrandingBrowser{
			Title:           "影策",
			MetaDescription: "影策，让故事开机。面向 AI 影视与短剧创作的开源工作台。",
		},
	}
}

func (s *Service) PublicBranding() (*PublicBrandingSetting, error) {
	_, value, err := s.readBrandingSetting()
	if err != nil {
		return nil, err
	}
	return s.publicBranding(value), nil
}

func (s *Service) AdminBranding(actor *model.User) (*AdminBrandingSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readBrandingSetting()
	if err != nil {
		return nil, err
	}
	return s.adminBranding(setting, value), nil
}

func (s *Service) UpdateBranding(actor *model.User, req UpdateBrandingRequest) (*AdminBrandingSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	config, err := normalizeBrandingConfig(req.Config)
	if err != nil {
		return nil, err
	}
	return s.writeBrandingSetting(actor, req.ExpectedRevision, config, nil, "branding.update", "更新网站品牌与登录页配置")
}

func (s *Service) ResetBranding(actor *model.User, expectedRevision int64) (*AdminBrandingSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	emptyAssets := BrandingAssetReferences{}
	return s.writeBrandingSetting(actor, expectedRevision, DefaultBrandingConfig(), &emptyAssets, "branding.reset", "恢复默认网站品牌")
}

func (s *Service) ClearBrandAsset(actor *model.User, slot string, expectedRevision int64) (*AdminBrandingSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	_, value, err := s.readBrandingSetting()
	if err != nil {
		return nil, err
	}
	if value.Revision != expectedRevision {
		return nil, NewAppError(http.StatusConflict, "品牌配置已在其他页面更新，请刷新后重试")
	}
	assets := value.Assets
	if err := setBrandAssetReference(&assets, slot, ""); err != nil {
		return nil, err
	}
	return s.writeBrandingSetting(actor, expectedRevision, value.Config, &assets, "branding.asset.clear", "移除网站品牌资源")
}

func (s *Service) UploadBrandAsset(actor *model.User, slot string, expectedRevision int64, header *multipart.FileHeader) (*AdminBrandingSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	mimeType, kind, err := validateBrandAssetUpload(slot, header)
	if err != nil {
		return nil, err
	}
	if header.Header == nil {
		header.Header = make(map[string][]string)
	}
	header.Header.Set("Content-Type", mimeType)
	resource, err := s.UploadResource(actor.ID, header, kind, 0, 0, 0)
	if err != nil {
		return nil, err
	}
	resource.PublicURL = ""

	_, value, err := s.readBrandingSetting()
	if err != nil {
		cleanupErr := s.deleteFreshAnnouncementImageResource(resource)
		if cleanupErr != nil {
			return nil, errors.Join(err, fmt.Errorf("清理未生效品牌资源失败：%w", cleanupErr))
		}
		return nil, err
	}
	assets := value.Assets
	if err := setBrandAssetReference(&assets, slot, resource.ID); err != nil {
		_ = s.deleteFreshAnnouncementImageResource(resource)
		return nil, err
	}
	config := value.Config
	switch slot {
	case BrandAssetAuthHero:
		config.Auth.HeroURL = ""
		config.Auth.HeroKind = ""
	case BrandAssetAuthHeroPoster:
		config.Auth.HeroPosterURL = ""
	}
	updated, err := s.writeBrandingSetting(actor, expectedRevision, config, &assets, "branding.asset.upload", "上传并启用网站品牌资源")
	if err == nil {
		return updated, nil
	}
	cleanupErr := s.deleteFreshAnnouncementImageResource(resource)
	if cleanupErr != nil {
		return nil, errors.Join(err, fmt.Errorf("清理未生效品牌资源失败：%w", cleanupErr))
	}
	return nil, err
}

func (s *Service) OpenBrandAsset(slot string, rangeHeader string) (*ResourceStream, error) {
	_, value, err := s.readBrandingSetting()
	if err != nil {
		return nil, err
	}
	resourceID, err := brandAssetReference(value.Assets, slot)
	if err != nil {
		return nil, err
	}
	if resourceID == "" {
		return nil, NotFound("品牌资源不存在")
	}
	resource, err := s.repo.Resource(resourceID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, NotFound("品牌资源不存在")
		}
		return nil, err
	}
	if resource.Status != model.ResourceStatusReady || !brandAssetMimeAllowed(slot, resource.MimeType) {
		return nil, NotFound("品牌资源不可用")
	}
	return s.openResourceRange(resource.UserID, resource, rangeHeader)
}

func (s *Service) writeBrandingSetting(actor *model.User, expectedRevision int64, config BrandingConfig, assetsOverride *BrandingAssetReferences, action string, summary string) (*AdminBrandingSetting, error) {
	currentSetting, current, err := s.readBrandingSetting()
	if err != nil {
		return nil, err
	}
	if expectedRevision < 0 || current.Revision != expectedRevision {
		return nil, NewAppError(http.StatusConflict, "品牌配置已在其他页面更新，请刷新后重试")
	}
	config, err = normalizeBrandingConfig(config)
	if err != nil {
		return nil, err
	}
	assets := current.Assets
	if assetsOverride != nil {
		assets = *assetsOverride
	}
	next := brandingSettingValue{Revision: current.Revision + 1, Config: config, Assets: assets}
	encoded, err := json.Marshal(next)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	setting := &model.SystemSetting{Key: brandingSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID, CreatedAt: now, UpdatedAt: now}
	var expectedJSON *string
	if currentSetting != nil {
		setting.CreatedAt = currentSetting.CreatedAt
		expectedJSON = &currentSetting.ValueJSON
	}
	audit, err := newAdminAuditEvent(actor, action, "system_setting", brandingSettingKey, summary, map[string]any{
		"previousRevision": current.Revision,
		"nextRevision":     next.Revision,
		"previous":         current,
		"next":             next,
	})
	if err != nil {
		return nil, err
	}
	updated, err := s.repo.CompareAndSwapSystemSetting(setting, expectedJSON, audit)
	if err != nil {
		return nil, err
	}
	if !updated {
		return nil, NewAppError(http.StatusConflict, "品牌配置已在其他页面更新，请刷新后重试")
	}
	return s.adminBranding(setting, next), nil
}

func (s *Service) readBrandingSetting() (*model.SystemSetting, brandingSettingValue, error) {
	setting, err := s.repo.SystemSetting(brandingSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, brandingSettingValue{Config: DefaultBrandingConfig()}, nil
	}
	if err != nil {
		return nil, brandingSettingValue{}, err
	}
	var value brandingSettingValue
	if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
		return nil, brandingSettingValue{}, fmt.Errorf("品牌配置无法解析：%w", err)
	}
	if value.Revision <= 0 {
		return nil, brandingSettingValue{}, errors.New("品牌配置缺少有效修订号")
	}
	value.Config, err = normalizeBrandingConfig(value.Config)
	if err != nil {
		return nil, brandingSettingValue{}, fmt.Errorf("品牌配置无效：%w", err)
	}
	return setting, value, nil
}

func (s *Service) publicBranding(value brandingSettingValue) *PublicBrandingSetting {
	return &PublicBrandingSetting{Revision: value.Revision, Config: value.Config, Assets: brandingAssetURLs(value.Assets, value.Config.Auth, value.Revision, s.brandHeroKind(value.Assets.AuthHeroResourceID))}
}

func (s *Service) adminBranding(setting *model.SystemSetting, value brandingSettingValue) *AdminBrandingSetting {
	view := &AdminBrandingSetting{
		PublicBrandingSetting: PublicBrandingSetting{Revision: value.Revision, Config: value.Config, Assets: brandingAssetURLs(value.Assets, value.Config.Auth, value.Revision, s.brandHeroKind(value.Assets.AuthHeroResourceID))},
		AssetReferences:       value.Assets,
		Configured:            setting != nil,
	}
	if setting != nil {
		view.UpdatedBy = setting.UpdatedBy
		createdAt, updatedAt := setting.CreatedAt, setting.UpdatedAt
		view.CreatedAt, view.UpdatedAt = &createdAt, &updatedAt
	}
	return view
}

func (s *Service) brandHeroKind(resourceID string) string {
	if strings.TrimSpace(resourceID) == "" {
		return ""
	}
	resource, err := s.repo.Resource(resourceID)
	if err != nil || resource.Status != model.ResourceStatusReady {
		return ""
	}
	if strings.HasPrefix(strings.ToLower(resource.MimeType), "video/") {
		return "video"
	}
	if strings.HasPrefix(strings.ToLower(resource.MimeType), "image/") {
		return "image"
	}
	return ""
}

func brandingAssetURLs(assets BrandingAssetReferences, auth BrandingAuth, revision int64, heroKind string) BrandingAssetURLs {
	version := fmt.Sprintf("?v=%d", revision)
	result := BrandingAssetURLs{LogoURL: "/logo.svg", FaviconURL: "/logo.svg", AuthHeroKind: heroKind}
	if assets.LogoResourceID != "" {
		result.LogoURL = "/api/public/branding/assets/" + BrandAssetLogo + version
	}
	if assets.FaviconResourceID != "" {
		result.FaviconURL = "/api/public/branding/assets/" + BrandAssetFavicon + version
	}
	if assets.AuthHeroResourceID != "" {
		result.AuthHeroURL = "/api/public/branding/assets/" + BrandAssetAuthHero + version
	}
	if assets.AuthHeroPosterResourceID != "" {
		result.AuthHeroPosterURL = "/api/public/branding/assets/" + BrandAssetAuthHeroPoster + version
	}
	if auth.HeroURL != "" {
		result.AuthHeroURL = auth.HeroURL
		result.AuthHeroKind = auth.HeroKind
	}
	if auth.HeroPosterURL != "" {
		result.AuthHeroPosterURL = auth.HeroPosterURL
	}
	return result
}

func normalizeBrandingConfig(config BrandingConfig) (BrandingConfig, error) {
	config.Identity.DisplayName = strings.TrimSpace(config.Identity.DisplayName)
	config.Identity.ShortName = strings.TrimSpace(config.Identity.ShortName)
	config.Identity.EnglishName = strings.TrimSpace(config.Identity.EnglishName)
	config.Identity.WorkspaceLabel = strings.TrimSpace(config.Identity.WorkspaceLabel)
	config.Identity.Slogan = strings.TrimSpace(config.Identity.Slogan)
	config.Identity.Description = strings.TrimSpace(config.Identity.Description)
	config.Theme.PrimaryColor = strings.ToUpper(strings.TrimSpace(config.Theme.PrimaryColor))
	config.Auth.Eyebrow = strings.TrimSpace(config.Auth.Eyebrow)
	config.Auth.Title = strings.TrimSpace(config.Auth.Title)
	config.Auth.Description = strings.TrimSpace(config.Auth.Description)
	config.Auth.LiveBadge = strings.TrimSpace(config.Auth.LiveBadge)
	config.Auth.HeroURL = strings.TrimSpace(config.Auth.HeroURL)
	config.Auth.HeroKind = strings.ToLower(strings.TrimSpace(config.Auth.HeroKind))
	config.Auth.HeroPosterURL = strings.TrimSpace(config.Auth.HeroPosterURL)
	config.Browser.Title = strings.TrimSpace(config.Browser.Title)
	config.Browser.MetaDescription = strings.TrimSpace(config.Browser.MetaDescription)

	for _, field := range []struct {
		name     string
		value    string
		required bool
		max      int
	}{
		{"品牌展示名称", config.Identity.DisplayName, true, 40},
		{"品牌简称", config.Identity.ShortName, true, 20},
		{"品牌英文名", config.Identity.EnglishName, false, 80},
		{"工作台名称", config.Identity.WorkspaceLabel, true, 40},
		{"品牌标语", config.Identity.Slogan, false, 160},
		{"品牌描述", config.Identity.Description, false, 400},
		{"登录页眉", config.Auth.Eyebrow, false, 80},
		{"登录页标题", config.Auth.Title, true, 140},
		{"登录页描述", config.Auth.Description, false, 300},
		{"登录页状态文案", config.Auth.LiveBadge, false, 40},
		{"浏览器标题", config.Browser.Title, true, 80},
		{"浏览器描述", config.Browser.MetaDescription, false, 300},
	} {
		if field.required && field.value == "" {
			return BrandingConfig{}, BadAuthRequest(field.name + "不能为空")
		}
		if utf8.RuneCountInString(field.value) > field.max {
			return BrandingConfig{}, BadAuthRequest(fmt.Sprintf("%s不能超过 %d 个字符", field.name, field.max))
		}
	}
	if !brandHexColorPattern.MatchString(config.Theme.PrimaryColor) {
		return BrandingConfig{}, BadAuthRequest("品牌主色必须是 #RRGGBB 格式")
	}
	if config.Auth.HeroURL == "" {
		config.Auth.HeroKind = ""
	} else {
		if config.Auth.HeroKind != "image" && config.Auth.HeroKind != "video" {
			return BrandingConfig{}, BadAuthRequest("登录页背景 URL 必须选择图片或视频类型")
		}
		if err := validateExternalBrandAssetURL(config.Auth.HeroURL); err != nil {
			return BrandingConfig{}, BadAuthRequest("登录页背景 URL " + err.Error())
		}
	}
	if config.Auth.HeroPosterURL != "" {
		if err := validateExternalBrandAssetURL(config.Auth.HeroPosterURL); err != nil {
			return BrandingConfig{}, BadAuthRequest("视频海报 URL " + err.Error())
		}
	}
	return config, nil
}

func validateExternalBrandAssetURL(value string) error {
	if utf8.RuneCountInString(value) > 2048 {
		return errors.New("不能超过 2048 个字符")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" {
		return errors.New("必须是完整的 https:// 地址")
	}
	if parsed.User != nil {
		return errors.New("不能包含账号或密码")
	}
	return nil
}

func validateBrandAssetUpload(slot string, header *multipart.FileHeader) (string, string, error) {
	if _, err := brandAssetReference(BrandingAssetReferences{}, slot); err != nil {
		return "", "", err
	}
	if header == nil || header.Size <= 0 {
		return "", "", BadAuthRequest("请选择要上传的品牌资源")
	}
	maxBytes := brandHeroMaxBytes
	switch slot {
	case BrandAssetLogo:
		maxBytes = brandLogoMaxBytes
	case BrandAssetFavicon:
		maxBytes = brandFaviconMaxBytes
	case BrandAssetAuthHeroPoster:
		maxBytes = brandHeroPosterMaxBytes
	}
	if header.Size > maxBytes {
		return "", "", BadAuthRequest("该品牌资源不能超过 " + formatBrandAssetLimit(maxBytes))
	}
	file, err := header.Open()
	if err != nil {
		return "", "", err
	}
	defer file.Close()
	buffer := make([]byte, 512)
	read, readErr := file.Read(buffer)
	if readErr != nil && read == 0 {
		return "", "", BadAuthRequest("品牌资源内容无法读取")
	}
	mimeType := detectBrandAssetMime(buffer[:read])
	if mimeType == "" || !brandAssetMimeAllowed(slot, mimeType) {
		return "", "", BadAuthRequest("品牌资源格式不支持，Logo/图片使用 PNG、JPEG、WebP 或 GIF，登录背景视频使用 MP4 或 WebM")
	}
	kind := "image"
	if strings.HasPrefix(mimeType, "video/") {
		kind = "video"
	}
	return mimeType, kind, nil
}

func formatBrandAssetLimit(maxBytes int64) string {
	if maxBytes < 1<<20 {
		return fmt.Sprintf("%dKB", maxBytes>>10)
	}
	return fmt.Sprintf("%dMB", maxBytes>>20)
}

func detectBrandAssetMime(buffer []byte) string {
	if len(buffer) >= 8 && bytes.Equal(buffer[:8], []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}) {
		return "image/png"
	}
	if len(buffer) >= 3 && buffer[0] == 0xff && buffer[1] == 0xd8 && buffer[2] == 0xff {
		return "image/jpeg"
	}
	if len(buffer) >= 12 && bytes.Equal(buffer[:4], []byte("RIFF")) && bytes.Equal(buffer[8:12], []byte("WEBP")) {
		return "image/webp"
	}
	if len(buffer) >= 6 && (bytes.Equal(buffer[:6], []byte("GIF87a")) || bytes.Equal(buffer[:6], []byte("GIF89a"))) {
		return "image/gif"
	}
	if len(buffer) >= 12 && bytes.Equal(buffer[4:8], []byte("ftyp")) {
		return "video/mp4"
	}
	if len(buffer) >= 4 && bytes.Equal(buffer[:4], []byte{0x1a, 0x45, 0xdf, 0xa3}) {
		return "video/webm"
	}
	return ""
}

func brandAssetMimeAllowed(slot string, mimeType string) bool {
	mimeType = strings.ToLower(strings.TrimSpace(strings.Split(mimeType, ";")[0]))
	image := oneOf(mimeType, "image/png", "image/jpeg", "image/webp", "image/gif")
	if slot == BrandAssetAuthHero {
		return image || oneOf(mimeType, "video/mp4", "video/webm")
	}
	return image
}

func brandAssetReference(assets BrandingAssetReferences, slot string) (string, error) {
	switch strings.TrimSpace(slot) {
	case BrandAssetLogo:
		return assets.LogoResourceID, nil
	case BrandAssetFavicon:
		return assets.FaviconResourceID, nil
	case BrandAssetAuthHero:
		return assets.AuthHeroResourceID, nil
	case BrandAssetAuthHeroPoster:
		return assets.AuthHeroPosterResourceID, nil
	default:
		return "", BadAuthRequest("品牌资源位置无效")
	}
}

func setBrandAssetReference(assets *BrandingAssetReferences, slot string, resourceID string) error {
	if assets == nil {
		return BadAuthRequest("品牌资源配置无效")
	}
	resourceID = strings.TrimSpace(resourceID)
	switch strings.TrimSpace(slot) {
	case BrandAssetLogo:
		assets.LogoResourceID = resourceID
	case BrandAssetFavicon:
		assets.FaviconResourceID = resourceID
	case BrandAssetAuthHero:
		assets.AuthHeroResourceID = resourceID
	case BrandAssetAuthHeroPoster:
		assets.AuthHeroPosterResourceID = resourceID
	default:
		return BadAuthRequest("品牌资源位置无效")
	}
	return nil
}

func (s *Service) brandingResourceReferences() (map[string]AdminResourceReferenceView, error) {
	_, value, err := s.readBrandingSetting()
	if err != nil {
		return nil, err
	}
	result := map[string]AdminResourceReferenceView{}
	for slot, resourceID := range map[string]string{
		BrandAssetLogo:           value.Assets.LogoResourceID,
		BrandAssetFavicon:        value.Assets.FaviconResourceID,
		BrandAssetAuthHero:       value.Assets.AuthHeroResourceID,
		BrandAssetAuthHeroPoster: value.Assets.AuthHeroPosterResourceID,
	} {
		if resourceID != "" {
			result[resourceID] = AdminResourceReferenceView{Kind: "platform_branding", ID: slot, Title: "网站品牌"}
		}
	}
	return result, nil
}
