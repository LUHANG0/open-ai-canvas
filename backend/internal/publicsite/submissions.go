package publicsite

import (
	"context"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Job struct {
	ID            string     `json:"id"`
	Provider      string     `json:"provider"`
	URL           string     `json:"url"`
	Revision      string     `json:"revision"`
	Status        string     `json:"status"`
	Attempts      int        `json:"attempts"`
	NextAttemptAt time.Time  `json:"nextAttemptAt"`
	LeaseToken    string     `json:"leaseToken,omitempty"`
	LeaseUntil    time.Time  `json:"leaseUntil,omitempty"`
	LastCode      string     `json:"lastCode,omitempty"`
	HTTPStatus    int        `json:"httpStatus,omitempty"`
	UpdatedAt     time.Time  `json:"updatedAt"`
	AcceptedAt    *time.Time `json:"acceptedAt,omitempty"`
}
type SubmissionState struct {
	Jobs              []Job                `json:"jobs"`
	ProviderNotBefore map[string]time.Time `json:"providerNotBefore"`
	ConfigRevision    int64                `json:"configRevision"`
}
type SubmissionResult struct {
	Accepted  bool
	Code      string
	Status    int
	RetryAt   time.Time
	Quota     bool
	Permanent bool
}

func jobID(provider string, e Entry) string {
	h := sha256.Sum256([]byte(provider + "\n" + e.URL + "\n" + e.Revision))
	return hex.EncodeToString(h[:])
}
func (s *SubmissionState) Sync(entries []Entry, providers []string, configRevision int64, now time.Time) {
	if s.ProviderNotBefore == nil {
		s.ProviderNotBefore = map[string]time.Time{}
	}
	old := map[string]Job{}
	for _, j := range s.Jobs {
		old[j.ID] = j
	}
	var jobs []Job
	active := map[string]bool{}
	current := map[string]bool{}
	for _, e := range entries {
		current[e.URL+"\n"+e.Revision] = true
	}
	for _, provider := range providers {
		active[provider] = true
		for _, e := range entries {
			id := jobID(provider, e)
			j, exists := old[id]
			if !exists {
				j = Job{ID: id, Provider: provider, URL: e.URL, Revision: e.Revision, Status: "pending", NextAttemptAt: now, UpdatedAt: now}
			}
			if s.ConfigRevision != configRevision && (j.Status == "blocked" || j.Status == "retry") {
				j.Status = "pending"
				j.Attempts = 0
				j.NextAttemptAt = now
				j.LastCode = ""
			}
			jobs = append(jobs, j)
		}
	}
	// Preserve receipts for disabled providers so re-enabling does not resend
	// an already accepted version. Disabled pending jobs are not claimable.
	for _, j := range s.Jobs {
		if j.Status == "accepted" && !active[j.Provider] && current[j.URL+"\n"+j.Revision] && (j.Provider == "baidu" || j.Provider == "indexnow") {
			jobs = append(jobs, j)
		}
	}
	// Only current published revisions are eligible. Removed and superseded URLs
	// cannot remain in the retry queue or be reintroduced by an old lease result.
	s.Jobs = jobs
	s.ConfigRevision = configRevision
}
func (s *SubmissionState) Claim(now time.Time, token string) *Job {
	for i := range s.Jobs {
		j := &s.Jobs[i]
		if j.Status == "accepted" || j.Status == "blocked" || j.NextAttemptAt.After(now) || s.ProviderNotBefore[j.Provider].After(now) {
			continue
		}
		if j.Status == "sending" && j.LeaseUntil.After(now) {
			continue
		}
		j.Status = "sending"
		j.Attempts++
		j.LeaseToken = token
		j.LeaseUntil = now.Add(2 * time.Minute)
		j.UpdatedAt = now
		copy := *j
		return &copy
	}
	return nil
}
func (s *SubmissionState) Complete(id, token string, r SubmissionResult, now time.Time) bool {
	for i := range s.Jobs {
		j := &s.Jobs[i]
		if j.ID != id || j.LeaseToken != token || j.Status != "sending" {
			continue
		}
		j.LeaseToken = ""
		j.LeaseUntil = time.Time{}
		j.UpdatedAt = now
		j.LastCode = r.Code
		j.HTTPStatus = r.Status
		if r.Quota && !r.RetryAt.IsZero() {
			if s.ProviderNotBefore == nil {
				s.ProviderNotBefore = map[string]time.Time{}
			}
			s.ProviderNotBefore[j.Provider] = r.RetryAt
		}
		if r.Accepted {
			j.Status = "accepted"
			j.NextAttemptAt = time.Time{}
			j.AcceptedAt = &now
			return true
		}
		if r.Permanent || j.Attempts >= 10 {
			j.Status = "blocked"
			return true
		}
		j.Status = "retry"
		j.NextAttemptAt = r.RetryAt
		if j.NextAttemptAt.IsZero() {
			delay := time.Minute * time.Duration(1<<min(j.Attempts, 8))
			j.NextAttemptAt = now.Add(delay)
		}
		if r.Quota {
			j.Status = "quota"
			s.ProviderNotBefore[j.Provider] = j.NextAttemptAt
		}
		return true
	}
	return false
}
func NextQuotaDay(now time.Time) time.Time {
	z := now.In(time.FixedZone("CST", 8*3600))
	return time.Date(z.Year(), z.Month(), z.Day()+1, 0, 5, 0, 0, z.Location())
}
func retryAfter(value string, now time.Time) time.Time {
	if n, err := strconv.Atoi(value); err == nil && n > 0 {
		return now.Add(time.Duration(min(n, 86400)) * time.Second)
	}
	if t, err := http.ParseTime(value); err == nil && t.After(now) && t.Before(now.Add(24*time.Hour)) {
		return t
	}
	return now.Add(30 * time.Minute)
}

type SendOptions struct{ AllowBaiduHTTP bool }

// Send only fixed official endpoints. URL, provider key and upstream response
// bodies must never be used as public errors or log messages.
func Send(ctx context.Context, client *http.Client, j Job, origin, baiduToken, indexKey string, now time.Time, options ...SendOptions) SubmissionResult {
	u, err := url.Parse(j.URL)
	site, _ := url.Parse(origin)
	if err != nil || site == nil || u.Scheme != "https" || u.Host != site.Host || u.RawQuery != "" || u.Fragment != "" {
		return SubmissionResult{Code: "invalid_public_url", Permanent: true}
	}
	var req *http.Request
	if j.Provider == "baidu" {
		if baiduToken == "" {
			return SubmissionResult{Code: "credentials_required", Permanent: true}
		}
		scheme := "https"
		if len(options) > 0 && options[0].AllowBaiduHTTP {
			scheme = "http"
		}
		endpoint := scheme + "://data.zz.baidu.com/urls?" + url.Values{"site": {origin}, "token": {baiduToken}}.Encode()
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, endpoint, strings.NewReader(j.URL+"\n"))
		if req != nil {
			req.Header.Set("Content-Type", "text/plain; charset=utf-8")
		}
	} else if j.Provider == "indexnow" {
		if indexKey == "" {
			return SubmissionResult{Code: "verification_key_required", Permanent: true}
		}
		body, _ := json.Marshal(map[string]any{"host": site.Hostname(), "key": indexKey, "keyLocation": origin + "/" + indexKey + ".txt", "urlList": []string{j.URL}})
		req, err = http.NewRequestWithContext(ctx, http.MethodPost, "https://api.indexnow.org/indexnow", strings.NewReader(string(body)))
		if req != nil {
			req.Header.Set("Content-Type", "application/json; charset=utf-8")
		}
	} else {
		return SubmissionResult{Code: "unsupported_provider", Permanent: true}
	}
	if err != nil {
		return SubmissionResult{Code: "request_invalid", Permanent: true}
	}
	req.Header.Set("User-Agent", "MengCeng-Publication/1.0")
	isolatedClient := *client
	isolatedClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	resp, err := isolatedClient.Do(req)
	if err != nil {
		if resp != nil && resp.Body != nil {
			resp.Body.Close()
		}
		var certificateError *tls.CertificateVerificationError
		if errors.As(err, &certificateError) {
			return SubmissionResult{Code: "tls_certificate_invalid", Permanent: true}
		}
		return SubmissionResult{Code: "network_error"}
	}
	defer resp.Body.Close()
	r := SubmissionResult{Status: resp.StatusCode}
	if resp.StatusCode == http.StatusTooManyRequests {
		r.Code = "rate_limited"
		r.Quota = true
		r.RetryAt = retryAfter(resp.Header.Get("Retry-After"), now)
		return r
	}
	if resp.StatusCode >= 500 {
		r.Code = "provider_unavailable"
		return r
	}
	if j.Provider == "indexnow" {
		if resp.StatusCode == 200 || resp.StatusCode == 202 {
			r.Accepted = true
			r.Code = "accepted"
			if resp.StatusCode == 202 {
				r.Code = "accepted_pending_verification"
			}
			return r
		}
		r.Code = "verification_or_request_rejected"
		r.Permanent = resp.StatusCode != 403
		r.RetryAt = now.Add(6 * time.Hour)
		return r
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		r.Code = "response_read_failed"
		return r
	}
	var data struct {
		Success  int      `json:"success"`
		Remain   *int     `json:"remain"`
		Error    int      `json:"error"`
		Message  string   `json:"message"`
		NotSame  []string `json:"not_same_site"`
		NotValid []string `json:"not_valid"`
	}
	if json.Unmarshal(b, &data) != nil {
		r.Code = "invalid_provider_response"
		return r
	}
	if resp.StatusCode == 200 && data.Error == 0 && data.Success == 1 && len(data.NotSame) == 0 && len(data.NotValid) == 0 {
		r.Accepted = true
		r.Code = "accepted"
		if data.Remain != nil && *data.Remain == 0 {
			r.Quota = true
			r.RetryAt = NextQuotaDay(now)
		}
		return r
	}
	if data.Error == 401 || resp.StatusCode == 401 || resp.StatusCode == 403 {
		r.Code = "credentials_rejected"
		r.Permanent = true
		return r
	}
	if strings.Contains(strings.ToLower(data.Message), "quota") {
		r.Code = "quota_exhausted"
		r.Quota = true
		r.RetryAt = NextQuotaDay(now)
		return r
	}
	if len(data.NotSame) > 0 || len(data.NotValid) > 0 {
		r.Code = "url_rejected"
		r.Permanent = true
		return r
	}
	r.Code = fmt.Sprintf("provider_rejected_%d", resp.StatusCode)
	r.Permanent = resp.StatusCode >= 400 && resp.StatusCode < 500
	return r
}
