package auth

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"mime"
	"mime/multipart"
	"net/mail"
	"net/textproto"
)

func smtpMessage(setting EmailSettingValue, recipient, subject, text string) ([]byte, error) {
	var message bytes.Buffer
	from := mail.Address{Name: setting.FromName, Address: setting.FromEmail}
	fmt.Fprintf(&message, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\n", from.String(), recipient, mime.QEncoding.Encode("UTF-8", subject))
	if setting.htmlBody == "" {
		fmt.Fprintf(&message, "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n%s\r\n", encodedMailBody(text))
		return message.Bytes(), nil
	}
	writer := multipart.NewWriter(&message)
	fmt.Fprintf(&message, "Content-Type: multipart/alternative; boundary=%q\r\n\r\n", writer.Boundary())
	for _, part := range []struct{ kind, body string }{{"text/plain", text}, {"text/html", setting.htmlBody}} {
		header := textproto.MIMEHeader{"Content-Type": {part.kind + "; charset=UTF-8"}, "Content-Transfer-Encoding": {"base64"}}
		body, err := writer.CreatePart(header)
		if err != nil {
			return nil, err
		}
		if _, err := body.Write([]byte(encodedMailBody(part.body))); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return message.Bytes(), nil
}

func encodedMailBody(value string) string {
	encoded := base64.StdEncoding.EncodeToString([]byte(value))
	var wrapped bytes.Buffer
	for len(encoded) > 76 {
		wrapped.WriteString(encoded[:76] + "\r\n")
		encoded = encoded[76:]
	}
	wrapped.WriteString(encoded)
	return wrapped.String()
}
