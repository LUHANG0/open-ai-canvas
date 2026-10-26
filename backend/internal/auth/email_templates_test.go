package auth

import (
	"encoding/base64"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/mail"
	"strings"
	"testing"

	"yingce/backend/internal/kernel"
	"yingce/backend/internal/model"
)

func TestEmailTemplatesSavePreviewAndRejectStaleUpdates(t *testing.T) {
	svc, _ := newPasswordResetTestService(t)
	actor := &model.User{ID: "admin", Role: model.UserRoleAdmin}
	initial, err := svc.AdminEmailTemplates(actor)
	if err != nil || initial.Revision != 0 || len(initial.Templates) != 5 {
		t.Fatalf("initial = %#v, %v", initial, err)
	}
	custom := initial.Templates["register"]
	custom.Title = "在{{brand}}开启新故事"
	initial.Templates["register"] = custom
	saved, err := svc.UpdateEmailTemplates(actor, EmailTemplatesRequest{Revision: 0, Templates: initial.Templates})
	if err != nil || saved.Revision != 1 || saved.UpdatedAt == nil {
		t.Fatalf("save = %#v, %v", saved, err)
	}
	read, err := svc.AdminEmailTemplates(actor)
	if err != nil || read.Templates["register"].Title != custom.Title {
		t.Fatalf("readback = %#v, %v", read, err)
	}
	_, err = svc.UpdateEmailTemplates(actor, EmailTemplatesRequest{Revision: 0, Templates: initial.Templates})
	var appErr *kernel.AppError
	if !errors.As(err, &appErr) || appErr.Status != 409 {
		t.Fatalf("stale update error = %v", err)
	}
	preview, err := svc.PreviewEmailTemplate(actor, EmailTemplatePreviewRequest{Scene: "register", Template: custom})
	if err != nil || !strings.Contains(preview.HTML, "在梦层开启新故事") || !strings.Contains(preview.Text, "验证码：123456") {
		t.Fatalf("preview = %#v, %v", preview, err)
	}
	if _, err := svc.UpdateEmailTemplates(actor, EmailTemplatesRequest{Revision: 1, Templates: read.Defaults}); err != nil {
		t.Fatal(err)
	}
	restored, _ := svc.AdminEmailTemplates(actor)
	if restored.Revision != 2 || restored.Templates["register"] != defaultEmailTemplates()["register"] {
		t.Fatal("defaults did not persist")
	}
}

func TestEmailTemplatesEscapeContentAndKeepCodeAndExpiry(t *testing.T) {
	for _, scene := range emailTemplateScenes {
		value := defaultEmailTemplates()[scene]
		value.Intro = `<img src=x onerror=alert(1)> {{brand}}`
		preview, err := renderVerificationEmail(value, `<script>brand</script>`, "065432")
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(preview.HTML, "<script>") || strings.Contains(preview.HTML, "<img src=x") {
			t.Fatalf("HTML was not escaped for %s", scene)
		}
		if !strings.Contains(preview.HTML, "065432") || !strings.Contains(preview.HTML, "10 分钟内有效") || !strings.Contains(preview.HTML, "请勿向任何人透露") {
			t.Fatalf("verification elements missing for %s", scene)
		}
		if !strings.Contains(preview.Text, "验证码：065432") {
			t.Fatal("plain text lost leading zero")
		}
	}
}

func TestEmailTemplatesRejectInvalidContent(t *testing.T) {
	for _, mutation := range []func(*EmailTemplate){
		func(v *EmailTemplate) { v.Subject = "hello\nBcc: attacker@example.com" },
		func(v *EmailTemplate) { v.Title = " " },
		func(v *EmailTemplate) { v.Intro = "{{code}}" },
		func(v *EmailTemplate) { v.Intro = "{{brand" },
		func(v *EmailTemplate) { v.Footer = strings.Repeat("字", 401) },
	} {
		value := defaultEmailTemplates()["register"]
		mutation(&value)
		if validateEmailTemplate(value) == nil {
			t.Fatalf("accepted invalid content: %#v", value)
		}
	}
	if validateEmailTemplates(map[string]EmailTemplate{}) == nil {
		t.Fatal("accepted missing scenes")
	}
}

type emailTemplatesDeniedHost struct{ nopHost }

func (emailTemplatesDeniedHost) RequireAdmin(*model.User) error {
	return kernel.Forbidden("仅管理员可操作")
}

func TestEmailTemplatesRequireAdminBeforeReadingOrWriting(t *testing.T) {
	svc := New(nil, emailTemplatesDeniedHost{}, nil)
	actor := &model.User{ID: "member"}
	if _, err := svc.AdminEmailTemplates(actor); err == nil {
		t.Fatal("read allowed")
	}
	if _, err := svc.UpdateEmailTemplates(actor, EmailTemplatesRequest{}); err == nil {
		t.Fatal("write allowed")
	}
	if _, err := svc.PreviewEmailTemplate(actor, EmailTemplatePreviewRequest{}); err == nil {
		t.Fatal("preview allowed")
	}
}

func TestEmailTemplatesSendingUsesSavedTemplateAndSamePlainText(t *testing.T) {
	svc, _ := newPasswordResetTestService(t)
	actor := &model.User{ID: "admin"}
	templates := defaultEmailTemplates()
	value := templates["login"]
	value.Subject = "{{brand}}登录确认"
	templates["login"] = value
	if _, err := svc.UpdateEmailTemplates(actor, EmailTemplatesRequest{Templates: templates}); err != nil {
		t.Fatal(err)
	}
	called := false
	svc.SetMailSender(func(setting EmailSettingValue, to, subject, text string) error {
		called = true
		if subject != "梦层登录确认" || to != "member@example.com" || !strings.Contains(text, "验证码：065432") || !strings.Contains(setting.htmlBody, "065432") {
			t.Fatal("saved template was not delivered in both formats")
		}
		return nil
	})
	if err := svc.deliverVerificationEmail(EmailSettingValue{FromName: "梦层"}, "member@example.com", "login", "065432"); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("mail sender not called")
	}
}

func TestSMTPVerificationMessageHasAlternativeMIMEParts(t *testing.T) {
	preview, err := renderVerificationEmail(defaultEmailTemplates()["register"], "梦层", "065432")
	if err != nil {
		t.Fatal(err)
	}
	setting := EmailSettingValue{FromName: "梦层", FromEmail: "noreply@example.com", htmlBody: preview.HTML}
	raw, err := smtpMessage(setting, "member@example.com", preview.Subject, preview.Text)
	if err != nil {
		t.Fatal(err)
	}
	message, err := mail.ReadMessage(strings.NewReader(string(raw)))
	if err != nil {
		t.Fatal(err)
	}
	kind, params, err := mime.ParseMediaType(message.Header.Get("Content-Type"))
	if err != nil || kind != "multipart/alternative" {
		t.Fatalf("MIME header = %q, %v", kind, err)
	}
	reader := multipart.NewReader(message.Body, params["boundary"])
	for _, expected := range []struct{ kind, body string }{{"text/plain", preview.Text}, {"text/html", preview.HTML}} {
		part, err := reader.NextPart()
		if err != nil {
			t.Fatal(err)
		}
		kind, _, err := mime.ParseMediaType(part.Header.Get("Content-Type"))
		if err != nil || kind != expected.kind {
			t.Fatalf("part = %q, %v", kind, err)
		}
		decoded, err := io.ReadAll(base64.NewDecoder(base64.StdEncoding, part))
		if err != nil || string(decoded) != expected.body {
			t.Fatalf("body mismatch for %s: %v", kind, err)
		}
	}
	if _, err := reader.NextPart(); !errors.Is(err, io.EOF) {
		t.Fatalf("unexpected extra part: %v", err)
	}
}

func TestEmailTemplatesCompareAndSwapHandlesFirstSaveRace(t *testing.T) {
	svc, _ := newPasswordResetTestService(t)
	first := &model.SystemSetting{Key: emailTemplatesKey, ValueJSON: `{"revision":1}`}
	second := &model.SystemSetting{Key: emailTemplatesKey, ValueJSON: `{"revision":2}`}
	if ok, err := svc.repo.CompareAndSwapEmailTemplates(first, nil); !ok || err != nil {
		t.Fatalf("first = %v, %v", ok, err)
	}
	if ok, err := svc.repo.CompareAndSwapEmailTemplates(second, nil); ok || err != nil {
		t.Fatalf("duplicate insert = %v, %v", ok, err)
	}
	stale := *first
	if ok, err := svc.repo.CompareAndSwapEmailTemplates(second, first); !ok || err != nil {
		t.Fatalf("update = %v, %v", ok, err)
	}
	if ok, err := svc.repo.CompareAndSwapEmailTemplates(first, &stale); ok || err != nil {
		t.Fatalf("stale update = %v, %v", ok, err)
	}
}

func TestEmailTemplateSMTPLogsRedactHTMLAndWrappedEncoding(t *testing.T) {
	html := "<p>验证码：065432</p>" + strings.Repeat("邮件内容", 40)
	setting := EmailSettingValue{htmlBody: html}
	for _, echoed := range []string{html, encodedMailBody(html)} {
		got := smtpLogError(errors.New("550 rejected: "+echoed), setting, "member@example.com", "subject", "验证码：065432")
		if strings.Contains(got, "065432") || strings.Contains(got, echoed) || !strings.Contains(got, "550 rejected") {
			t.Fatal("mail content leaked or diagnostic lost")
		}
	}
}
