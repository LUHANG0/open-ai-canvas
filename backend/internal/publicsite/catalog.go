// Package publicsite owns the versioned, public reading pages and their discovery
// catalog. It has no access to accounts, private assets or application drafts.
package publicsite

import (
	"crypto/sha256"
	"embed"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io/fs"
	"net/url"
	"path"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

//go:embed content/*.json page.html site.css site.js
var files embed.FS

type Section struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Paragraphs []string `json:"paragraphs"`
	Steps      []string `json:"steps,omitempty"`
	Example    string   `json:"example,omitempty"`
}
type Question struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}
type Page struct {
	Path        string     `json:"path"`
	Kind        string     `json:"kind"`
	Title       string     `json:"title"`
	Heading     string     `json:"heading"`
	Description string     `json:"description"`
	Intro       []string   `json:"intro"`
	Image       string     `json:"image"`
	ImageAlt    string     `json:"imageAlt"`
	Sections    []Section  `json:"sections"`
	FAQ         []Question `json:"faq"`
	Related     []string   `json:"related"`
	Target      string     `json:"target"`
	UpdatedAt   time.Time  `json:"updatedAt"`
	Published   bool       `json:"published"`
}
type Catalog struct {
	pages  []Page
	byPath map[string]Page
}

var once sync.Once
var builtin *Catalog
var builtinErr error

func Default() (*Catalog, error) {
	once.Do(func() { builtin, builtinErr = Load(files) })
	return builtin, builtinErr
}

var publicPath = regexp.MustCompile(`^/(features|tutorials)/[a-z0-9]+(?:-[a-z0-9]+)*$`)
var sectionID = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)

// Adding a published content file is sufficient: routing, navigation, sitemap,
// related reading and the submission scan all consume this catalog.
func Load(source fs.FS) (*Catalog, error) {
	names, err := fs.Glob(source, "content/*.json")
	if err != nil {
		return nil, err
	}
	c := &Catalog{byPath: map[string]Page{}}
	for _, name := range names {
		b, err := fs.ReadFile(source, name)
		if err != nil {
			return nil, err
		}
		var p Page
		d := json.NewDecoder(strings.NewReader(string(b)))
		d.DisallowUnknownFields()
		if err = d.Decode(&p); err != nil {
			return nil, fmt.Errorf("public content %s: %w", name, err)
		}
		if !p.Published {
			continue
		}
		if !publicPath.MatchString(p.Path) || p.Title == "" || p.Heading == "" || p.Description == "" || p.UpdatedAt.IsZero() || len(p.Sections) == 0 || (p.Kind != "feature" && p.Kind != "tutorial") {
			return nil, fmt.Errorf("invalid public content %s", name)
		}
		if (p.Kind == "feature") != strings.HasPrefix(p.Path, "/features/") {
			return nil, fmt.Errorf("public content kind/path mismatch %s", name)
		}
		if _, exists := c.byPath[p.Path]; exists {
			return nil, fmt.Errorf("duplicate public path %s", p.Path)
		}
		if !strings.HasPrefix(p.Image, "/brand/") || strings.Contains(p.Image, "..") || p.ImageAlt == "" {
			return nil, fmt.Errorf("invalid public image %s", name)
		}
		if p.Target != "/create?mode=video" && p.Target != "/canvas" && p.Target != "/projects" {
			return nil, fmt.Errorf("invalid public creation target %s", name)
		}
		seen := map[string]bool{}
		for _, s := range p.Sections {
			if !sectionID.MatchString(s.ID) || seen[s.ID] || s.Title == "" || len(s.Paragraphs) == 0 {
				return nil, fmt.Errorf("invalid public section %s", name)
			}
			seen[s.ID] = true
		}
		c.byPath[p.Path] = p
		c.pages = append(c.pages, p)
	}
	if len(c.pages) > 500 {
		return nil, fmt.Errorf("public catalog exceeds 500 pages")
	}
	for _, p := range c.pages {
		for _, link := range p.Related {
			if _, ok := c.byPath[link]; !ok {
				return nil, fmt.Errorf("unknown published related page %s", link)
			}
		}
	}
	sort.Slice(c.pages, func(i, j int) bool { return c.pages[i].Path < c.pages[j].Path })
	for _, kind := range []string{"features", "tutorials"} {
		p := Page{Path: "/" + kind, Kind: "index", Heading: "把创作的方法展开", Title: "AI 影像创作教程与工作流", Description: "从画面描述、参考素材到角色和分镜，阅读梦层的影像创作方法。", Image: "/brand/story-worktable.jpg", ImageAlt: "角色参考与镜头规划的创作示意", Target: "/create?mode=video", Published: true}
		if kind == "features" {
			p.Heading = "找到你的创作入口"
			p.Title = "AI 视频、创作画布与短剧工作台"
			p.Description = "了解梦层的 AI 视频创作、素材画布与短剧项目工具，选择适合当前作品的起点。"
		}
		for _, child := range c.pages {
			if strings.HasPrefix(child.Path, p.Path+"/") {
				p.Related = append(p.Related, child.Path)
				if child.UpdatedAt.After(p.UpdatedAt) {
					p.UpdatedAt = child.UpdatedAt
				}
			}
		}
		c.byPath[p.Path] = p
		c.pages = append(c.pages, p)
	}
	return c, nil
}
func (c *Catalog) Pages() []Page             { return append([]Page(nil), c.pages...) }
func (c *Catalog) Get(p string) (Page, bool) { v, ok := c.byPath[p]; return v, ok }
func Revision(p Page) string {
	b, _ := json.Marshal(p)
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}
func Origin(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "https" && u.Scheme != "http") {
		return "", fmt.Errorf("请配置有效的 CANVAS_PUBLIC_BASE_URL 站点根地址")
	}
	return u.Scheme + "://" + strings.ToLower(u.Host), nil
}
func LoginURL(target string) string { return "/login?next=" + url.QueryEscape(target) }

type Entry struct {
	URL       string    `json:"url"`
	Revision  string    `json:"revision"`
	UpdatedAt time.Time `json:"updatedAt"`
}

func (c *Catalog) Entries(origin string) []Entry {
	out := make([]Entry, 0, len(c.pages))
	for _, p := range c.pages {
		out = append(out, Entry{origin + p.Path, Revision(p), p.UpdatedAt})
	}
	return out
}
func Sitemap(entries []Entry) ([]byte, error) {
	type loc struct {
		URL      string `xml:"loc"`
		Modified string `xml:"lastmod,omitempty"`
	}
	doc := struct {
		XMLName xml.Name `xml:"urlset"`
		NS      string   `xml:"xmlns,attr"`
		URLs    []loc    `xml:"url"`
	}{NS: "http://www.sitemaps.org/schemas/sitemap/0.9"}
	seen := map[string]bool{}
	for _, e := range entries {
		u, err := url.Parse(e.URL)
		if err != nil || u.Host == "" || u.RawQuery != "" || u.Fragment != "" || path.Clean(u.Path) != u.Path && u.Path != "/" {
			return nil, fmt.Errorf("invalid sitemap URL")
		}
		if seen[e.URL] {
			continue
		}
		seen[e.URL] = true
		l := loc{URL: e.URL}
		if !e.UpdatedAt.IsZero() {
			l.Modified = e.UpdatedAt.Format(time.RFC3339)
		}
		doc.URLs = append(doc.URLs, l)
	}
	b, err := xml.MarshalIndent(doc, "", "  ")
	return append([]byte(xml.Header), b...), err
}
