package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"infinite-canvas/backend/internal/model"

	"gorm.io/gorm"
)

const publicSiteSettingKey = "platform_public_site"

type PublicSiteHero struct {
	Eyebrow       string `json:"eyebrow"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	PrimaryCTA    string `json:"primaryCta"`
	SecondaryCTA  string `json:"secondaryCta"`
	ShowreelURL   string `json:"showreelUrl"`
	PosterURL     string `json:"posterUrl"`
	ShowreelLabel string `json:"showreelLabel"`
}

type PublicSiteSections struct {
	ProductTitle        string `json:"productTitle"`
	ProductDescription  string `json:"productDescription"`
	WorkflowTitle       string `json:"workflowTitle"`
	WorkflowDescription string `json:"workflowDescription"`
	ShowcaseTitle       string `json:"showcaseTitle"`
	ShowcaseDescription string `json:"showcaseDescription"`
	AboutTitle          string `json:"aboutTitle"`
	AboutDescription    string `json:"aboutDescription"`
}

type PublicSiteShowcaseItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	Description string `json:"description"`
	CoverURL    string `json:"coverUrl"`
	VideoURL    string `json:"videoUrl"`
	ExternalURL string `json:"externalUrl"`
}

type PublicSiteLinks struct {
	DocsURL       string `json:"docsUrl"`
	RepositoryURL string `json:"repositoryUrl"`
	DeploymentURL string `json:"deploymentUrl"`
	ContactURL    string `json:"contactUrl"`
	ICPText       string `json:"icpText"`
	ICPURL        string `json:"icpUrl"`
}

type PublicSiteSEO struct {
	HomeTitle       string `json:"homeTitle"`
	HomeDescription string `json:"homeDescription"`
	ProductTitle    string `json:"productTitle"`
	ShowcaseTitle   string `json:"showcaseTitle"`
	AboutTitle      string `json:"aboutTitle"`
}

type PublicSiteConfig struct {
	Hero      PublicSiteHero           `json:"hero"`
	Sections  PublicSiteSections       `json:"sections"`
	Showcases []PublicSiteShowcaseItem `json:"showcases"`
	Links     PublicSiteLinks          `json:"links"`
	SEO       PublicSiteSEO            `json:"seo"`
}

type PublicSiteSetting struct {
	Revision int64            `json:"revision"`
	Config   PublicSiteConfig `json:"config"`
}

type AdminPublicSiteSetting struct {
	Revision          int64            `json:"revision"`
	PublishedRevision int64            `json:"publishedRevision"`
	Draft             PublicSiteConfig `json:"draft"`
	Published         PublicSiteConfig `json:"published"`
	Dirty             bool             `json:"dirty"`
	Configured        bool             `json:"configured"`
	UpdatedBy         string           `json:"updatedBy"`
	CreatedAt         *time.Time       `json:"createdAt,omitempty"`
	UpdatedAt         *time.Time       `json:"updatedAt,omitempty"`
}

type UpdatePublicSiteRequest struct {
	ExpectedRevision int64            `json:"expectedRevision"`
	Config           PublicSiteConfig `json:"config"`
}

type publicSiteSettingValue struct {
	Revision          int64            `json:"revision"`
	PublishedRevision int64            `json:"publishedRevision"`
	Draft             PublicSiteConfig `json:"draft"`
	Published         PublicSiteConfig `json:"published"`
}

func DefaultPublicSiteConfig() PublicSiteConfig {
	return PublicSiteConfig{
		Hero: PublicSiteHero{
			Eyebrow:       "AI FILM PRODUCTION OS",
			Title:         "让故事开机。",
			Description:   "组织故事、角色与分镜，在一个工作台推进你的 AI 影视创作。",
			PrimaryCTA:    "受邀登录",
			SecondaryCTA:  "探索创作示例",
			ShowreelLabel: "《最后一班》 / 品牌概念视觉",
		},
		Sections: PublicSiteSections{
			ProductTitle:        "让灵感有位置，\n让创作有连续性。",
			ProductDescription:  "故事、参考、镜头和版本，在同一创作空间里相遇。从全局梳理，到一帧一帧打磨。",
			WorkflowTitle:       "一个故事，\n一步步成为画面。",
			WorkflowDescription: "先把故事说清，再把每个镜头想明白。角色、场景与参考，跟随作品一起向前。",
			ShowcaseTitle:       "创作正在发生。",
			ShowcaseDescription: "展示真实制作路径、产品能力与可公开作品。",
			AboutTitle:          "为真正的影视生产而设计。",
			AboutDescription:    "支持本地部署、数据自主、多模型接入和可扩展 Agent，让创作者掌握自己的工作流。",
		},
		Showcases: []PublicSiteShowcaseItem{
			{ID: "brand-concept-arrival", Title: "最后一班 · 抵达", Category: "品牌概念视觉 / 01", Description: "暮色落进山谷。一个旅人，赶往尚未熄灯的站台。", CoverURL: "/brand/last-train-wide.webp"},
			{ID: "brand-concept-traveler", Title: "最后一班 · 等候", Category: "品牌概念视觉 / 02", Description: "一张旧车票，一束车窗里的暖光。故事在细节里发生。", CoverURL: "/brand/last-train-traveler.webp"},
			{ID: "brand-concept-departure", Title: "最后一班 · 出发", Category: "品牌概念视觉 / 03", Description: "列车穿过薄雾，把没有说完的故事带向远方。", CoverURL: "/brand/last-train-departure.webp"},
		},
		Links: PublicSiteLinks{
			RepositoryURL: "",
			DeploymentURL: "/about#deployment",
			ICPURL:        "https://beian.miit.gov.cn/",
		},
		SEO: PublicSiteSEO{
			HomeTitle:       "影策｜AI 影视与短剧创作工作台",
			HomeDescription: "影策是一套从故事、角色、分镜到成片交付的 AI 影视创作工作台。",
			ProductTitle:    "产品能力｜影策",
			ShowcaseTitle:   "作品与案例｜影策",
			AboutTitle:      "关于影策｜影策",
		},
	}
}

func (s *Service) PublicSite() (*PublicSiteSetting, error) {
	_, value, err := s.readPublicSiteSetting()
	if err != nil {
		return nil, err
	}
	return &PublicSiteSetting{Revision: value.PublishedRevision, Config: value.Published}, nil
}

func (s *Service) AdminPublicSite(actor *model.User) (*AdminPublicSiteSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readPublicSiteSetting()
	if err != nil {
		return nil, err
	}
	return adminPublicSiteSetting(setting, value), nil
}

func (s *Service) UpdatePublicSiteDraft(actor *model.User, req UpdatePublicSiteRequest) (*AdminPublicSiteSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	config, err := normalizePublicSiteConfig(req.Config)
	if err != nil {
		return nil, err
	}
	return s.writePublicSiteSetting(actor, req.ExpectedRevision, func(value *publicSiteSettingValue) {
		value.Draft = config
	}, "public_site.draft.update", "更新官网内容草稿")
}

func (s *Service) PublishPublicSite(actor *model.User, expectedRevision int64) (*AdminPublicSiteSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	return s.writePublicSiteSetting(actor, expectedRevision, func(value *publicSiteSettingValue) {
		value.Published = value.Draft
		value.PublishedRevision = value.Revision + 1
	}, "public_site.publish", "发布官网内容")
}

func (s *Service) ResetPublicSiteDraft(actor *model.User, expectedRevision int64) (*AdminPublicSiteSetting, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	return s.writePublicSiteSetting(actor, expectedRevision, func(value *publicSiteSettingValue) {
		value.Draft = DefaultPublicSiteConfig()
	}, "public_site.draft.reset", "恢复官网默认草稿")
}

func (s *Service) writePublicSiteSetting(actor *model.User, expectedRevision int64, mutate func(*publicSiteSettingValue), action string, summary string) (*AdminPublicSiteSetting, error) {
	currentSetting, current, err := s.readPublicSiteSetting()
	if err != nil {
		return nil, err
	}
	if expectedRevision < 0 || current.Revision != expectedRevision {
		return nil, NewAppError(http.StatusConflict, "官网内容已在其他页面更新，请刷新后重试")
	}
	previous := current
	mutate(&current)
	current.Revision++
	current.Draft, err = normalizePublicSiteConfig(current.Draft)
	if err != nil {
		return nil, err
	}
	current.Published, err = normalizePublicSiteConfig(current.Published)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(current)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	setting := &model.SystemSetting{Key: publicSiteSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID, CreatedAt: now, UpdatedAt: now}
	var expectedJSON *string
	if currentSetting != nil {
		setting.CreatedAt = currentSetting.CreatedAt
		expectedJSON = &currentSetting.ValueJSON
	}
	audit, err := newAdminAuditEvent(actor, action, "system_setting", publicSiteSettingKey, summary, map[string]any{"previous": previous, "next": current})
	if err != nil {
		return nil, err
	}
	updated, err := s.repo.CompareAndSwapSystemSetting(setting, expectedJSON, audit)
	if err != nil {
		return nil, err
	}
	if !updated {
		return nil, NewAppError(http.StatusConflict, "官网内容已在其他页面更新，请刷新后重试")
	}
	return adminPublicSiteSetting(setting, current), nil
}

func (s *Service) readPublicSiteSetting() (*model.SystemSetting, publicSiteSettingValue, error) {
	setting, err := s.repo.SystemSetting(publicSiteSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		defaults := DefaultPublicSiteConfig()
		return nil, publicSiteSettingValue{Draft: defaults, Published: defaults}, nil
	}
	if err != nil {
		return nil, publicSiteSettingValue{}, err
	}
	var value publicSiteSettingValue
	if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
		return nil, publicSiteSettingValue{}, fmt.Errorf("官网配置无法解析：%w", err)
	}
	if value.Revision <= 0 {
		return nil, publicSiteSettingValue{}, errors.New("官网配置缺少有效修订号")
	}
	value.Draft, err = normalizePublicSiteConfig(value.Draft)
	if err != nil {
		return nil, publicSiteSettingValue{}, fmt.Errorf("官网草稿无效：%w", err)
	}
	value.Published, err = normalizePublicSiteConfig(value.Published)
	if err != nil {
		return nil, publicSiteSettingValue{}, fmt.Errorf("已发布官网配置无效：%w", err)
	}
	return setting, value, nil
}

func adminPublicSiteSetting(setting *model.SystemSetting, value publicSiteSettingValue) *AdminPublicSiteSetting {
	view := &AdminPublicSiteSetting{
		Revision:          value.Revision,
		PublishedRevision: value.PublishedRevision,
		Draft:             value.Draft,
		Published:         value.Published,
		Dirty:             !publicSiteConfigEqual(value.Draft, value.Published),
		Configured:        setting != nil,
	}
	if setting != nil {
		view.UpdatedBy = setting.UpdatedBy
		createdAt, updatedAt := setting.CreatedAt, setting.UpdatedAt
		view.CreatedAt, view.UpdatedAt = &createdAt, &updatedAt
	}
	return view
}

func publicSiteConfigEqual(left PublicSiteConfig, right PublicSiteConfig) bool {
	leftJSON, _ := json.Marshal(left)
	rightJSON, _ := json.Marshal(right)
	return string(leftJSON) == string(rightJSON)
}

func normalizePublicSiteConfig(config PublicSiteConfig) (PublicSiteConfig, error) {
	trim := func(value string) string { return strings.TrimSpace(value) }
	config.Hero.Eyebrow = trim(config.Hero.Eyebrow)
	config.Hero.Title = trim(config.Hero.Title)
	config.Hero.Description = trim(config.Hero.Description)
	config.Hero.PrimaryCTA = trim(config.Hero.PrimaryCTA)
	config.Hero.SecondaryCTA = trim(config.Hero.SecondaryCTA)
	config.Hero.ShowreelURL = trim(config.Hero.ShowreelURL)
	config.Hero.PosterURL = trim(config.Hero.PosterURL)
	config.Hero.ShowreelLabel = trim(config.Hero.ShowreelLabel)
	config.Sections.ProductTitle = trim(config.Sections.ProductTitle)
	config.Sections.ProductDescription = trim(config.Sections.ProductDescription)
	config.Sections.WorkflowTitle = trim(config.Sections.WorkflowTitle)
	config.Sections.WorkflowDescription = trim(config.Sections.WorkflowDescription)
	config.Sections.ShowcaseTitle = trim(config.Sections.ShowcaseTitle)
	config.Sections.ShowcaseDescription = trim(config.Sections.ShowcaseDescription)
	config.Sections.AboutTitle = trim(config.Sections.AboutTitle)
	config.Sections.AboutDescription = trim(config.Sections.AboutDescription)
	config.Links.DocsURL = trim(config.Links.DocsURL)
	config.Links.RepositoryURL = trim(config.Links.RepositoryURL)
	config.Links.DeploymentURL = trim(config.Links.DeploymentURL)
	config.Links.ContactURL = trim(config.Links.ContactURL)
	config.Links.ICPText = trim(config.Links.ICPText)
	config.Links.ICPURL = trim(config.Links.ICPURL)
	if config.Links.ICPURL == "" {
		config.Links.ICPURL = "https://beian.miit.gov.cn/"
	}
	if !strings.HasPrefix(config.Links.ICPURL, "https://") {
		return PublicSiteConfig{}, BadAuthRequest("备案链接必须是完整的 https:// 地址")
	}
	config.SEO.HomeTitle = trim(config.SEO.HomeTitle)
	config.SEO.HomeDescription = trim(config.SEO.HomeDescription)
	config.SEO.ProductTitle = trim(config.SEO.ProductTitle)
	config.SEO.ShowcaseTitle = trim(config.SEO.ShowcaseTitle)
	config.SEO.AboutTitle = trim(config.SEO.AboutTitle)

	for _, field := range []struct {
		name     string
		value    string
		required bool
		max      int
	}{
		{"官网主标题", config.Hero.Title, true, 120}, {"官网主说明", config.Hero.Description, true, 300}, {"主按钮", config.Hero.PrimaryCTA, true, 30}, {"次按钮", config.Hero.SecondaryCTA, false, 30},
		{"产品标题", config.Sections.ProductTitle, true, 160}, {"产品说明", config.Sections.ProductDescription, true, 400}, {"流程标题", config.Sections.WorkflowTitle, true, 160}, {"流程说明", config.Sections.WorkflowDescription, true, 400},
		{"作品标题", config.Sections.ShowcaseTitle, true, 160}, {"作品说明", config.Sections.ShowcaseDescription, true, 400}, {"关于标题", config.Sections.AboutTitle, true, 160}, {"关于说明", config.Sections.AboutDescription, true, 400},
		{"首页标题", config.SEO.HomeTitle, true, 100}, {"首页描述", config.SEO.HomeDescription, true, 300},
		{"备案号", config.Links.ICPText, false, 120},
	} {
		if field.required && field.value == "" {
			return PublicSiteConfig{}, BadAuthRequest(field.name + "不能为空")
		}
		if utf8.RuneCountInString(field.value) > field.max {
			return PublicSiteConfig{}, BadAuthRequest(fmt.Sprintf("%s不能超过 %d 个字符", field.name, field.max))
		}
	}
	for name, value := range map[string]string{
		"官网视频 URL": config.Hero.ShowreelURL, "官网海报 URL": config.Hero.PosterURL, "文档链接": config.Links.DocsURL, "代码仓库链接": config.Links.RepositoryURL,
		"部署链接": config.Links.DeploymentURL, "联系链接": config.Links.ContactURL, "备案链接": config.Links.ICPURL,
	} {
		if err := validatePublicSiteURL(value); err != nil {
			return PublicSiteConfig{}, BadAuthRequest(name + err.Error())
		}
	}
	if len(config.Showcases) > 8 {
		return PublicSiteConfig{}, BadAuthRequest("官网作品不能超过 8 个")
	}
	seen := make(map[string]struct{}, len(config.Showcases))
	for index := range config.Showcases {
		item := &config.Showcases[index]
		item.ID = trim(item.ID)
		item.Title = trim(item.Title)
		item.Category = trim(item.Category)
		item.Description = trim(item.Description)
		item.CoverURL = trim(item.CoverURL)
		item.VideoURL = trim(item.VideoURL)
		item.ExternalURL = trim(item.ExternalURL)
		if item.ID == "" {
			item.ID = fmt.Sprintf("showcase-%02d", index+1)
		}
		if _, duplicate := seen[item.ID]; duplicate {
			return PublicSiteConfig{}, BadAuthRequest("官网作品 ID 不能重复")
		}
		seen[item.ID] = struct{}{}
		if item.Title == "" || utf8.RuneCountInString(item.Title) > 80 || utf8.RuneCountInString(item.Description) > 300 {
			return PublicSiteConfig{}, BadAuthRequest("官网作品标题不能为空且标题/说明不能过长")
		}
		for name, value := range map[string]string{"封面 URL": item.CoverURL, "视频 URL": item.VideoURL, "外部链接": item.ExternalURL} {
			if err := validatePublicSiteURL(value); err != nil {
				return PublicSiteConfig{}, BadAuthRequest(fmt.Sprintf("作品 %d 的%s%s", index+1, name, err.Error()))
			}
		}
	}
	return config, nil
}

func validatePublicSiteURL(value string) error {
	if value == "" {
		return nil
	}
	if utf8.RuneCountInString(value) > 2048 {
		return errors.New("不能超过 2048 个字符")
	}
	if strings.HasPrefix(value, "/") && !strings.HasPrefix(value, "//") {
		return nil
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil {
		return errors.New("必须是站内路径或完整的 https:// 地址")
	}
	return nil
}
