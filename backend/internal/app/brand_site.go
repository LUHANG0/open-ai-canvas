package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"gorm.io/gorm"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
	"yingce/backend/internal/assets"
	"yingce/backend/internal/model"
)

const brandSiteSettingKey = "brand_site"

type BrandSiteMedia struct {
	ResourceID string `json:"resourceId"`
	Kind       string `json:"kind"`
	Alt        string `json:"alt"`
	PosterID   string `json:"posterId"`
}
type BrandSiteItem struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Link        string         `json:"link"`
	Media       BrandSiteMedia `json:"media"`
}
type BrandSiteSection struct {
	ID          string          `json:"id"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	Visible     bool            `json:"visible"`
	Items       []BrandSiteItem `json:"items"`
}
type BrandSiteContent struct {
	StoryTitle     string             `json:"storyTitle"`
	StoryText      string             `json:"storyText"`
	StoryCaption   string             `json:"storyCaption"`
	Title          string             `json:"title"`
	Description    string             `json:"description"`
	Detail         string             `json:"detail"`
	PrimaryLabel   string             `json:"primaryLabel"`
	PrimaryLink    string             `json:"primaryLink"`
	SecondaryLabel string             `json:"secondaryLabel"`
	HeroMedia      BrandSiteMedia     `json:"heroMedia"`
	Sections       []BrandSiteSection `json:"sections"`
	Footer         string             `json:"footer"`
}
type BrandSiteState struct {
	Revision     int64             `json:"revision"`
	Draft        BrandSiteContent  `json:"draft"`
	Published    BrandSiteContent  `json:"published"`
	Previous     *BrandSiteContent `json:"previous"`
	PublishedAt  *time.Time        `json:"publishedAt"`
	DraftSavedAt *time.Time        `json:"draftSavedAt"`
}
type BrandSiteChange struct {
	Revision int64            `json:"revision"`
	Content  BrandSiteContent `json:"content"`
}

func defaultBrandSiteContent() BrandSiteContent {
	return BrandSiteContent{
		StoryTitle: "一个不可能的场景", StoryText: "她站在盐原上。\n天空悬着一片海。\n下一刻，故事开始了。", StoryCaption: "盐原与巨浪 · AI 品牌创意示意",
		Title: "把灵感，\n推进成画面。", Description: "面向独立创作者与小型团队的 AI 影像创作工作台。", PrimaryLabel: "开始创作", PrimaryLink: "/create", Footer: "下一幕，由你开始。",
		Sections: []BrandSiteSection{
			{ID: "examples", Title: "每一种想象，都有画面。", Visible: true, Items: []BrandSiteItem{{Title: "叙事"}, {Title: "人物"}, {Title: "世界"}}},
			{ID: "entries", Title: "从第一句，到最后一镜。", Visible: true, Items: []BrandSiteItem{
				{Title: "写下灵感", Link: "/create"},
				{Title: "展开画布", Link: "/canvas"},
				{Title: "推进作品", Link: "/projects"},
			}},
			{ID: "process", Title: "一个想法，逐渐有了画面。", Description: "从一句话出发，保留探索的过程，也保留你的判断。", Visible: false, Items: []BrandSiteItem{
				{Title: "写下那一幕", Description: "红衣女子站在盐原上，仰望悬在天空的巨浪。"},
				{Title: "找到角色与世界", Description: "风吹起她的黑发。人物、光线与世界开始有了联系。"},
				{Title: "把故事拆成镜头", Description: "盐原远景，人物的目光，指尖触碰浅水。把一个场景展开成镜头。"},
				{Title: "向影像再走一步", Description: "在画布中组织参考，再把素材带进项目，继续打磨。"},
			}},
			{ID: "faq", Title: "常见问题", Visible: true, Items: []BrandSiteItem{
				{Title: "没有创作经验，也能开始吗？", Description: "可以从一句话或一组参考开始，逐步探索故事和画面。"},
				{Title: "如何加入梦层？", Description: "已有账号可直接登录；受邀用户可打开邀请链接或输入邀请码。注册入口以页面当前显示为准。"},
				{Title: "对话记录可以跨设备继续吗？", Description: "登录后，对话创作历史会按账号同步。其他内容请以工作台显示的保存状态为准。"},
				{Title: "模型生成如何收费？", Description: "以工作台实际配置和提交前的提示为准。"},
				{Title: "梦层会一键自动成片吗？", Description: "当前工作台提供对话、画布与项目工具，素材筛选和作品打磨仍由创作者决定。"},
				{Title: "可以从自己的参考素材开始吗？", Description: "可以在支持的创作入口添加参考素材，具体格式和限制以工作台提示为准。"},
			}},
		},
	}
}

func (s *Service) readBrandSite() (*model.SystemSetting, BrandSiteState, error) {
	state := BrandSiteState{Draft: defaultBrandSiteContent(), Published: defaultBrandSiteContent()}
	row, err := s.repo.SystemSetting(brandSiteSettingKey)
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, state, nil
	}
	if err != nil {
		return nil, state, err
	}
	if json.Unmarshal([]byte(row.ValueJSON), &state) != nil {
		return nil, state, errors.New("品牌官网配置无法读取")
	}
	return row, state, nil
}
func (s *Service) PublicBrandSite() (*BrandSiteContent, error) {
	_, state, err := s.readBrandSite()
	if err != nil {
		return nil, err
	}
	content := publicBrandSiteContent(state.Published)
	return &content, nil
}

func publicBrandSiteContent(content BrandSiteContent) BrandSiteContent {
	sections := make([]BrandSiteSection, 0, len(content.Sections))
	for _, section := range content.Sections {
		if section.Visible {
			sections = append(sections, section)
		}
	}
	content.Sections = sections
	return content
}
func (s *Service) AdminBrandSite(actor *model.User) (*BrandSiteState, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	_, state, err := s.readBrandSite()
	return &state, err
}
func (s *Service) ChangeBrandSite(actor *model.User, action string, input BrandSiteChange) (*BrandSiteState, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	s.storageMu.Lock()
	defer s.storageMu.Unlock()
	row, state, err := s.readBrandSite()
	if err != nil {
		return nil, err
	}
	if input.Revision != state.Revision {
		return nil, creationConflict("官网版本已更新，请重新载入后再编辑")
	}
	now := time.Now().UTC()
	switch action {
	case "draft":
		if err = s.validateBrandSite(actor, input.Content, state); err != nil {
			return nil, err
		}
		state.Draft = input.Content
		state.DraftSavedAt = &now
	case "publish":
		if err = s.validateBrandSite(actor, state.Draft, state); err != nil {
			return nil, err
		}
		old := state.Published
		state.Previous = &old
		state.Published = state.Draft
		state.PublishedAt = &now
	case "restore":
		if state.Previous == nil {
			return nil, BadAuthRequest("尚无上一发布版本")
		}
		if err = s.validateBrandSite(actor, *state.Previous, state); err != nil {
			return nil, err
		}
		old := state.Published
		state.Published = *state.Previous
		state.Previous = &old
		state.PublishedAt = &now
	default:
		return nil, BadAuthRequest("官网操作无效")
	}
	state.Revision++
	encoded, err := json.Marshal(state)
	if err != nil {
		return nil, err
	}
	ok, err := s.repo.CompareAndSwapSystemSetting(&model.SystemSetting{Key: brandSiteSettingKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}, row)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, creationConflict("官网版本已更新，请重新载入后再编辑")
	}
	return &state, nil
}
func validBrandLink(value string) bool {
	if value == "" {
		return true
	}
	u, err := url.Parse(value)
	if err != nil || strings.ContainsAny(value, "\\\r\n\t") || u.User != nil {
		return false
	}
	if strings.HasPrefix(value, "/") {
		return !strings.HasPrefix(value, "//") && u.Host == ""
	}
	return u.Scheme == "https" && u.Hostname() != ""
}
func brandMedia(content BrandSiteContent) []BrandSiteMedia {
	all := []BrandSiteMedia{content.HeroMedia}
	for _, section := range content.Sections {
		for _, item := range section.Items {
			all = append(all, item.Media)
		}
	}
	return all
}
func brandReferences(content BrandSiteContent, id string) bool {
	for _, m := range brandMedia(content) {
		if id != "" && (m.ResourceID == id || m.PosterID == id) {
			return true
		}
	}
	return false
}
func (s *Service) validateBrandSite(actor *model.User, c BrandSiteContent, state BrandSiteState) error {
	text := func(v string, max int) bool {
		return utf8.RuneCountInString(v) <= max && strings.IndexFunc(v, func(r rune) bool { return unicode.IsControl(r) && r != '\n' }) < 0
	}
	if !text(c.StoryTitle, 60) || !text(c.StoryText, 300) || !text(c.StoryCaption, 160) || strings.TrimSpace(c.Title) == "" || !text(c.Title, 100) || !text(c.Description, 240) || !text(c.Detail, 500) || !text(c.Footer, 240) || strings.TrimSpace(c.PrimaryLabel) == "" || !text(c.PrimaryLabel, 30) || !text(c.SecondaryLabel, 30) || c.PrimaryLink != "/create" || len(c.Sections) != 4 {
		return BadAuthRequest("官网首屏或版块格式无效；主入口必须为 /create")
	}
	seen := map[string]bool{}
	for _, section := range c.Sections {
		if !map[string]bool{"process": true, "entries": true, "examples": true, "faq": true}[section.ID] || seen[section.ID] || strings.TrimSpace(section.Title) == "" || section.Items == nil || !text(section.Title, 100) || !text(section.Description, 500) || len(section.Items) > 12 {
			return BadAuthRequest("官网版块或条目无效")
		}
		seen[section.ID] = true
		for _, item := range section.Items {
			if strings.TrimSpace(item.Title) == "" || !text(item.Title, 100) || !text(item.Description, 1500) || !text(item.Link, 500) || !validBrandLink(item.Link) {
				return BadAuthRequest("官网文字或链接无效")
			}
		}
	}
	for _, m := range brandMedia(c) {
		if m.ResourceID != "" && strings.TrimSpace(m.Alt) == "" {
			return BadAuthRequest("请填写媒体文字说明")
		}
		if m.PosterID != "" && m.Kind != "video" {
			return BadAuthRequest("仅视频支持封面")
		}
		if !text(m.Alt, 160) {
			return BadAuthRequest("媒体说明过长")
		}
		if m.ResourceID == "" && m.PosterID != "" {
			return BadAuthRequest("请先选择视频")
		}
		for _, id := range []string{m.ResourceID, m.PosterID} {
			if id == "" {
				continue
			}
			r, err := s.repo.Resource(id)
			if err != nil {
				return BadAuthRequest("官网媒体不存在")
			}
			referenced := brandReferences(state.Draft, id) || brandReferences(state.Published, id) || (state.Previous != nil && brandReferences(*state.Previous, id))
			if r.UserID != actor.ID && !referenced {
				return Forbidden("不能使用其他管理员的未发布媒体")
			}
			kind := m.Kind
			if id == m.PosterID {
				kind = "image"
			}
			if kind != "image" && kind != "video" {
				return BadAuthRequest("官网媒体类型无效")
			}
			if err := validateAppearanceResourceType(updateResourceSlot(kind), r); err != nil {
				return err
			}
			if r.Provider != "local" {
				return BadAuthRequest("官网媒体必须使用私有本地上传，避免草稿公开")
			}
			stream, openErr := s.openResourceRange(r.UserID, r, "")
			if openErr != nil {
				return BadAuthRequest("官网媒体文件不可用，请重新上传")
			}
			_ = stream.Body.Close()
		}
	}
	return nil
}
func (s *Service) PrepareBrandSiteMedia(actor *model.User, id string, options ResourceAccessOptions, rangeHeader string) (*ResourceDelivery, error) {
	if actor != nil {
		if err := s.RequireAdmin(actor); err != nil {
			return nil, err
		}
	}
	_, state, err := s.readBrandSite()
	if err != nil {
		return nil, err
	}
	if actor == nil && !brandReferences(publicBrandSiteContent(state.Published), id) {
		return nil, NotFound("官网媒体未发布")
	}
	r, err := s.repo.Resource(id)
	if err != nil {
		return nil, NotFound("官网媒体不存在")
	}
	if actor != nil && r.UserID != actor.ID && !brandReferences(state.Draft, id) && !brandReferences(state.Published, id) && (state.Previous == nil || !brandReferences(*state.Previous, id)) {
		return nil, Forbidden("不能预览其他管理员的媒体")
	}
	if err := validateAppearanceResourceType(updateResourceSlot(r.Kind), r); err != nil {
		return nil, err
	}
	if options.Purpose == "" {
		options.Purpose = assets.PurposeDisplay
	}
	return s.prepareResourceDelivery(r.UserID, r, options, rangeHeader)
}
func (s *Service) brandSiteResourceReferences(ids []string) map[string][]AdminResourceReferenceView {
	result := map[string][]AdminResourceReferenceView{}
	_, state, err := s.readBrandSite()
	for _, id := range ids {
		if err != nil || brandReferences(state.Draft, id) || brandReferences(state.Published, id) || (state.Previous != nil && brandReferences(*state.Previous, id)) {
			result[id] = []AdminResourceReferenceView{{Kind: "品牌官网", ID: brandSiteSettingKey, Title: fmt.Sprintf("官网草稿、发布或恢复版本（%d）", state.Revision)}}
		}
	}
	return result
}
