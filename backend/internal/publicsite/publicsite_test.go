package publicsite

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"encoding/xml"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/fstest"
	"time"
)

func TestCatalogNewPublishedFileFlowsIntoRenderAndSitemap(t *testing.T) {
	c, err := Default()
	if err != nil {
		t.Fatal(err)
	}
	if len(c.Pages()) < 3 {
		t.Fatalf("catalog pages: %d", len(c.Pages()))
	}
	sample, _ := c.Get("/features/ai-video")
	sample.Path = "/features/new-camera"
	sample.Title = `A <script>alert(1)</script>`
	sample.Related = nil
	b, _ := json.Marshal(sample)
	draft := sample
	draft.Path = "/features/draft"
	draft.Published = false
	d, _ := json.Marshal(draft)
	next, err := Load(fstest.MapFS{"content/new.json": {Data: b}, "content/draft.json": {Data: d}})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := next.Get(draft.Path); ok {
		t.Fatal("draft is public")
	}
	if _, ok := next.Get(sample.Path); !ok {
		t.Fatal("new content needs manual route registration")
	}
	html, err := next.Render(sample, "https://example.test", `梦层 </script><img src=x>`)
	if err != nil {
		t.Fatal(err)
	}
	rendered := string(html)
	if strings.Contains(rendered, "<img src=x>") || strings.Contains(rendered, "<script>alert(1)</script>") || !strings.Contains(rendered, "A &lt;script&gt;") {
		t.Fatal("unescaped authored text")
	}
	if !strings.Contains(rendered, `rel="canonical" href="https://example.test/features/new-camera"`) || !strings.Contains(rendered, `type="application/ld+json"`) {
		t.Fatal("missing metadata")
	}
	if !strings.Contains(rendered, `rel="icon" href="/favicon.png" type="image/png" sizes="192x192"`) {
		t.Fatal("reading pages must use the same crawlable favicon as the homepage")
	}
	entries := next.Entries("https://example.test")
	body, err := Sitemap(append(entries, entries[0]))
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		URLs []struct {
			Loc     string `xml:"loc"`
			Lastmod string `xml:"lastmod"`
		} `xml:"url"`
	}
	if xml.Unmarshal(body, &doc) != nil || len(doc.URLs) != 3 {
		t.Fatalf("dynamic sitemap: %s", body)
	}
	for _, u := range doc.URLs {
		if strings.Contains(u.Loc, "draft") {
			t.Fatal("draft in sitemap")
		}
	}
	for _, p := range c.Pages() {
		if _, err := c.Render(p, "https://example.test", "梦层"); err != nil {
			t.Fatalf("%s: %v", p.Path, err)
		}
	}
	sample.Related = []string{"/features/missing"}
	b, _ = json.Marshal(sample)
	if _, err := Load(fstest.MapFS{"content/new.json": {Data: b}}); err == nil {
		t.Fatal("accepted missing related page")
	}
}

func TestOriginAndLoginDestination(t *testing.T) {
	for _, raw := range []string{"", "https://x.test/path", "https://user:secret@x.test", "//x.test", "javascript:alert(1)", "https://x.test/?key=secret"} {
		if _, err := Origin(raw); err == nil {
			t.Fatalf("accepted %q", raw)
		}
	}
	if got, err := Origin("https://Example.TEST/"); err != nil || got != "https://example.test" {
		t.Fatalf("origin: %s %v", got, err)
	}
	if LoginURL("/create?mode=video") != "/login?next=%2Fcreate%3Fmode%3Dvideo" {
		t.Fatal("login destination lost")
	}
}

func TestSubmissionLeaseDedupChangesRemovalAndQuota(t *testing.T) {
	now := time.Date(2026, 10, 26, 10, 0, 0, 0, time.UTC)
	entries := []Entry{{URL: "https://example.test/features/a", Revision: "v1"}, {URL: "https://example.test/features/b", Revision: "v1"}}
	var s SubmissionState
	s.Sync(entries, []string{"baidu"}, 1, now)
	j := s.Claim(now, "one")
	if j == nil {
		t.Fatal("no claim")
	}
	other := s.Claim(now, "two")
	if other == nil || other.ID == j.ID {
		t.Fatal("same lease claimed twice")
	}
	if s.Complete(j.ID, "wrong", SubmissionResult{Accepted: true}, now) {
		t.Fatal("foreign completion")
	}
	until := NextQuotaDay(now)
	if !s.Complete(j.ID, "one", SubmissionResult{Accepted: true, Code: "accepted", Quota: true, RetryAt: until}, now) {
		t.Fatal("completion lost")
	}
	if !s.ProviderNotBefore["baidu"].Equal(until) {
		t.Fatal("accepted last quota must block other jobs")
	}
	s.Complete(other.ID, "two", SubmissionResult{Code: "network_error"}, now)
	s.Sync(entries, []string{"baidu"}, 2, now)
	if s.Jobs[0].Status != "accepted" || s.Claim(now.Add(time.Hour), "early") != nil {
		t.Fatal("accepted job resent or quota ignored")
	}
	j = s.Claim(until, "retry")
	if j == nil || j.ID != other.ID {
		t.Fatal("quota did not recover")
	}
	s.Complete(j.ID, "retry", SubmissionResult{Permanent: true, Code: "credentials_rejected"}, until)
	s.Sync(entries, []string{"baidu"}, 3, until)
	if s.Jobs[1].Status != "pending" {
		t.Fatal("new config did not release blocked job")
	}
	entries[0].Revision = "v2"
	s.Sync(entries[:1], []string{"baidu"}, 3, until)
	if len(s.Jobs) != 1 || s.Jobs[0].Status != "pending" {
		t.Fatal("superseded and removed URLs retained")
	}
	if s.Complete(j.ID, "retry", SubmissionResult{Accepted: true}, until) {
		t.Fatal("old lease resurrected removed page")
	}
	j = s.Claim(until, "crashed")
	if j == nil {
		t.Fatal("no changed revision")
	}
	if s.Claim(until.Add(time.Minute), "too-soon") != nil {
		t.Fatal("lease expiry ignored")
	}
	if j = s.Claim(until.Add(3*time.Minute), "restart"); j == nil || j.Attempts != 2 {
		t.Fatal("expired lease cannot recover after restart")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestOfficialSubmissionResponsesAndCredentialBoundary(t *testing.T) {
	now := time.Now()
	for _, tc := range []struct {
		name, provider, body       string
		status                     int
		accepted, permanent, quota bool
	}{
		{"baidu-accepted-last-quota", "baidu", `{"success":1,"remain":0}`, 200, true, false, true},
		{"baidu-bad-key", "baidu", `{"error":401,"message":"bad token: test-secret"}`, 401, false, true, false},
		{"baidu-quota", "baidu", `{"error":400,"message":"over quota"}`, 400, false, false, true},
		{"baidu-invalid", "baidu", `{"success":0,"not_valid":["https://example.test/"]}`, 200, false, true, false},
		{"indexnow-verifying", "indexnow", "", 202, true, false, false},
		{"indexnow-verify-retry", "indexnow", "", 403, false, false, false},
		{"indexnow-rate-limit", "indexnow", "", 429, false, false, true},
		{"provider-down", "indexnow", "", 503, false, false, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if r.URL.Scheme != "https" || (r.URL.Host != "data.zz.baidu.com" && r.URL.Host != "api.indexnow.org") {
					t.Fatal("nonofficial destination")
				}
				b, _ := io.ReadAll(r.Body)
				if !strings.Contains(string(b), "https://example.test/features/a") {
					t.Fatal("URL not sent")
				}
				return &http.Response{StatusCode: tc.status, Header: http.Header{"Retry-After": []string{"120"}}, Body: io.NopCloser(strings.NewReader(tc.body)), Request: r}, nil
			})}
			result := Send(context.Background(), client, Job{Provider: tc.provider, URL: "https://example.test/features/a"}, "https://example.test", "test-secret", "0123456789abcdef0123456789abcdef", now)
			if result.Accepted != tc.accepted || result.Permanent != tc.permanent || result.Quota != tc.quota {
				t.Fatalf("unexpected result: %+v", result)
			}
			if strings.Contains(result.Code, "test-secret") {
				t.Fatal("credential in error")
			}
		})
	}
	calls := 0
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		calls++
		return &http.Response{StatusCode: 302, Header: http.Header{"Location": []string{"https://attacker.test/steal"}}, Body: io.NopCloser(strings.NewReader("")), Request: r}, nil
	})}
	result := Send(context.Background(), client, Job{Provider: "indexnow", URL: "https://example.test/"}, "https://example.test", "", "key", now)
	if calls != 1 || result.Accepted {
		t.Fatal("followed credential redirect")
	}
	result = Send(context.Background(), client, Job{Provider: "baidu", URL: "https://private.test/"}, "https://example.test", "token", "key", now)
	if calls != 1 || !result.Permanent {
		t.Fatal("foreign URL submitted")
	}
}

func TestBaiduHTTPNeedsExplicitOptionAndDoesNotChangeIndexNow(t *testing.T) {
	for _, tc := range []struct {
		provider string
		allow    bool
		scheme   string
	}{{"baidu", false, "https"}, {"baidu", true, "http"}, {"indexnow", true, "https"}} {
		client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.URL.Scheme != tc.scheme {
				t.Fatalf("unexpected transport %s", r.URL.Scheme)
			}
			expectedHost := "data.zz.baidu.com"
			if tc.provider == "indexnow" {
				expectedHost = "api.indexnow.org"
			}
			if r.URL.Host != expectedHost {
				t.Fatal("unexpected destination")
			}
			return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(strings.NewReader(`{"success":1,"remain":20}`)), Request: r}, nil
		})}
		result := Send(context.Background(), client, Job{Provider: tc.provider, URL: "https://example.test/"}, "https://example.test", "test-secret", "test-key", time.Now(), SendOptions{AllowBaiduHTTP: tc.allow})
		if !result.Accepted {
			t.Fatalf("explicit transport failed: %+v", result)
		}
	}
	client := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return nil, &tls.CertificateVerificationError{Err: errors.New("mismatch")}
	})}
	result := Send(context.Background(), client, Job{Provider: "baidu", URL: "https://example.test/"}, "https://example.test", "test-secret", "", time.Now())
	if result.Code != "tls_certificate_invalid" || !result.Permanent {
		t.Fatalf("TLS failure was not classified: %+v", result)
	}
}
func TestAcceptedReceiptSurvivesProviderPause(t *testing.T) {
	now := time.Now()
	entries := []Entry{{URL: "https://example.test/", Revision: "v1"}}
	var state SubmissionState
	state.Sync(entries, []string{"baidu"}, 1, now)
	j := state.Claim(now, "first")
	state.Complete(j.ID, "first", SubmissionResult{Accepted: true}, now)
	state.Sync(entries, nil, 2, now)
	if len(state.Jobs) != 1 || state.Claim(now, "disabled") != nil {
		t.Fatal("accepted receipt lost on pause")
	}
	state.Sync(entries, []string{"baidu"}, 3, now)
	if state.Claim(now, "duplicate") != nil {
		t.Fatal("re-enabling resent accepted version")
	}
	state.Jobs[0].Status = "retry"
	state.Jobs[0].NextAttemptAt = now.Add(time.Hour)
	state.Sync(entries, []string{"baidu"}, 4, now)
	if state.Claim(now, "fixed-config") == nil {
		t.Fatal("fixed configuration did not unblock retry")
	}
}
