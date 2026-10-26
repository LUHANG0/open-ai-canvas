package auth

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"errors"
	"html/template"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

const emailTemplatesKey = "email_templates"

type EmailTemplate struct {
	Subject string `json:"subject"`
	Title   string `json:"title"`
	Intro   string `json:"intro"`
	Footer  string `json:"footer"`
}

type EmailTemplatesRequest struct {
	Revision  int64                    `json:"revision"`
	Templates map[string]EmailTemplate `json:"templates"`
}

type PublicEmailTemplates struct {
	Revision  int64                    `json:"revision"`
	Templates map[string]EmailTemplate `json:"templates"`
	Defaults  map[string]EmailTemplate `json:"defaults"`
	UpdatedAt *time.Time               `json:"updatedAt,omitempty"`
}

type EmailTemplatePreviewRequest struct {
	Scene    string        `json:"scene"`
	Template EmailTemplate `json:"template"`
}

type EmailTemplatePreview struct {
	Subject string `json:"subject"`
	Text    string `json:"text"`
	HTML    string `json:"html"`
}

var emailTemplateScenes = []string{"register", "login", "password_reset", "bind", "change_email"}

//go:embed email_verification.html
var verificationEmailHTML string

var verificationEmailFrame = template.Must(template.New("verification").Parse(verificationEmailHTML))
var emailTemplateVariable = regexp.MustCompile(`\{\{[^{}]*\}\}`)

func defaultEmailTemplates() map[string]EmailTemplate {
	result := map[string]EmailTemplate{}
	for _, row := range []struct{ scene, subject, title, intro string }{
		{"register", "注册验证码", "开启你的创作旅程", "你正在注册{{brand}}。请在注册页面输入下方验证码，完成邮箱验证。"},
		{"login", "登录验证码", "验证身份，继续创作", "你正在登录 {{brand}}。请在登录页面输入下方验证码，确认是你本人操作。"},
		{"password_reset", "密码重置验证码", "重设密码，安全回到账号", "我们收到了你的密码重置请求。请在 {{brand}} 的密码找回页面输入下方验证码。"},
		{"bind", "绑定邮箱验证码", "为账号绑定邮箱", "你正在为 {{brand}} 账号绑定此邮箱。请返回操作页面，输入下方验证码完成验证。"},
		{"change_email", "更换邮箱验证码", "确认你的新邮箱", "你正在更换 {{brand}} 账号的邮箱。请返回账号设置，输入下方验证码完成验证。"},
	} {
		result[row.scene] = EmailTemplate{Subject: "{{brand}}" + row.subject, Title: row.title, Intro: row.intro, Footer: "如果这不是你的操作，请忽略此邮件。此邮件由系统自动发送，请勿直接回复。"}
	}
	return result
}

func validateEmailTemplates(templates map[string]EmailTemplate) error {
	if len(templates) != len(emailTemplateScenes) {
		return kernel.BadAuthRequest("请提供所有账户邮件场景的模板")
	}
	for _, scene := range emailTemplateScenes {
		value, exists := templates[scene]
		if !exists {
			return kernel.BadAuthRequest("缺少邮件模板：" + scene)
		}
		if err := validateEmailTemplate(value); err != nil {
			return err
		}
	}
	return nil
}

func validateEmailTemplate(value EmailTemplate) error {
	for _, field := range []struct {
		label, value string
		max          int
	}{{"邮件主题", value.Subject, 120}, {"邮件标题", value.Title, 80}, {"邮件说明", value.Intro, 600}, {"邮件页脚", value.Footer, 400}} {
		if strings.TrimSpace(field.value) == "" || utf8.RuneCountInString(field.value) > field.max || strings.ContainsAny(field.value, "\r\x00") {
			return kernel.BadAuthRequest(field.label + "不能为空或超出长度限制")
		}
		if field.label == "邮件主题" && strings.Contains(field.value, "\n") {
			return kernel.BadAuthRequest("邮件主题不能包含换行")
		}
		remaining := strings.ReplaceAll(field.value, "{{brand}}", "")
		if emailTemplateVariable.MatchString(remaining) || strings.Contains(remaining, "{{") || strings.Contains(remaining, "}}") {
			return kernel.BadAuthRequest("模板仅支持 {{brand}} 品牌名称变量")
		}
	}
	return nil
}

func (s *Service) readEmailTemplates() (*model.SystemSetting, EmailTemplatesRequest, error) {
	value := EmailTemplatesRequest{Templates: defaultEmailTemplates()}
	setting, err := s.repo.SystemSettingOptional(emailTemplatesKey)
	if err == nil && setting == nil {
		return nil, value, nil
	}
	if err != nil {
		return nil, value, err
	}
	if err := json.Unmarshal([]byte(setting.ValueJSON), &value); err != nil {
		return nil, value, errors.New("邮件模板配置格式无效")
	}
	if err := validateEmailTemplates(value.Templates); err != nil {
		return nil, value, err
	}
	return setting, value, nil
}

func publicEmailTemplates(setting *model.SystemSetting, value EmailTemplatesRequest) *PublicEmailTemplates {
	result := &PublicEmailTemplates{Revision: value.Revision, Templates: value.Templates, Defaults: defaultEmailTemplates()}
	if setting != nil {
		result.UpdatedAt = &setting.UpdatedAt
	}
	return result
}

func (s *Service) AdminEmailTemplates(actor *model.User) (*PublicEmailTemplates, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	setting, value, err := s.readEmailTemplates()
	if err != nil {
		return nil, err
	}
	return publicEmailTemplates(setting, value), nil
}

func (s *Service) UpdateEmailTemplates(actor *model.User, req EmailTemplatesRequest) (*PublicEmailTemplates, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if actor == nil {
		return nil, kernel.Unauthorized("请先登录")
	}
	if err := validateEmailTemplates(req.Templates); err != nil {
		return nil, err
	}
	previous, current, err := s.readEmailTemplates()
	if err != nil {
		return nil, err
	}
	if req.Revision != current.Revision {
		return nil, kernel.NewAppError(409, "邮件模板已被更新，请重新读取后再保存")
	}
	req.Revision++
	encoded, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	next := &model.SystemSetting{Key: emailTemplatesKey, ValueJSON: string(encoded), UpdatedBy: actor.ID}
	saved, err := s.repo.CompareAndSwapEmailTemplates(next, previous)
	if err != nil {
		return nil, err
	}
	if !saved {
		return nil, kernel.NewAppError(409, "邮件模板已被更新，请重新读取后再保存")
	}
	return publicEmailTemplates(next, req), nil
}

func (s *Service) PreviewEmailTemplate(actor *model.User, req EmailTemplatePreviewRequest) (*EmailTemplatePreview, error) {
	if err := s.host.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if _, ok := defaultEmailTemplates()[req.Scene]; !ok {
		return nil, kernel.BadAuthRequest("邮件场景无效")
	}
	if err := validateEmailTemplate(req.Template); err != nil {
		return nil, err
	}
	_, sender, err := s.readEmailSetting()
	if err != nil {
		return nil, err
	}
	sender = resolveEmailSender(sender, s.host.BrandName())
	return renderVerificationEmail(req.Template, sender.FromName, "123456")
}

func renderVerificationEmail(value EmailTemplate, brand, code string) (*EmailTemplatePreview, error) {
	if strings.TrimSpace(brand) == "" {
		brand = DefaultBrandName
	}
	replace := func(text string) string { return strings.ReplaceAll(text, "{{brand}}", brand) }
	if strings.ContainsAny(replace(value.Subject), "\r\n") {
		return nil, kernel.BadAuthRequest("邮件主题不能包含换行")
	}
	data := struct {
		Brand, Title, Intro, Footer, Code string
		Minutes                           int
	}{brand, replace(value.Title), replace(value.Intro), replace(value.Footer), code, int(registrationCodeTTL / time.Minute)}
	var html bytes.Buffer
	if err := verificationEmailFrame.Execute(&html, data); err != nil {
		return nil, err
	}
	return &EmailTemplatePreview{Subject: replace(value.Subject), HTML: html.String(), Text: data.Brand + "\n\n" + data.Title + "\n\n" + data.Intro + "\n\n验证码：" + code + "\n\n验证码 10 分钟内有效，仅用于本次操作。请勿向任何人透露验证码。\n\n" + data.Footer}, nil
}

func (s *Service) deliverVerificationEmail(setting EmailSettingValue, recipient, scene, code string) error {
	_, templates, err := s.readEmailTemplates()
	if err != nil {
		return err
	}
	value, ok := templates.Templates[scene]
	if !ok {
		return kernel.BadAuthRequest("邮件场景无效")
	}
	message, err := renderVerificationEmail(value, setting.FromName, code)
	if err != nil {
		return err
	}
	setting.htmlBody = message.HTML
	return s.deliverEmail(setting, recipient, message.Subject, message.Text)
}
