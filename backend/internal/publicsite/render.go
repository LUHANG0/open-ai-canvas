package publicsite

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
)

var pageTemplate = template.Must(template.New("page").Parse(string(asset("page.html"))))

func asset(name string) []byte {
	b, err := files.ReadFile(name)
	if err != nil {
		panic(err)
	}
	return b
}
func Asset(name string) ([]byte, bool) {
	if name != "site.css" && name != "site.js" {
		return nil, false
	}
	return asset(name), true
}

func (c *Catalog) Render(p Page, origin, brand string) ([]byte, error) {
	canonical := origin + p.Path
	parent := "/features"
	parentName := "产品功能"
	if strings.HasPrefix(p.Path, "/tutorials") {
		parent = "/tutorials"
		parentName = "创作教程"
	}
	crumbs := []any{map[string]any{"@type": "ListItem", "position": 1, "name": brand, "item": origin + "/"}}
	if p.Path != parent {
		crumbs = append(crumbs, map[string]any{"@type": "ListItem", "position": 2, "name": parentName, "item": origin + parent})
	}
	crumbs = append(crumbs, map[string]any{"@type": "ListItem", "position": len(crumbs) + 1, "name": p.Title, "item": canonical})
	kind := "WebPage"
	if p.Kind == "tutorial" {
		kind = "Article"
	}
	schema := map[string]any{"@context": "https://schema.org", "@graph": []any{
		map[string]any{"@type": kind, "@id": canonical + "#page", "url": canonical, "headline": p.Title, "description": p.Description, "inLanguage": "zh-CN", "dateModified": p.UpdatedAt, "image": origin + p.Image, "publisher": map[string]any{"@type": "Organization", "name": brand, "url": origin + "/"}},
		map[string]any{"@type": "BreadcrumbList", "itemListElement": crumbs},
	}}
	encoded, err := json.Marshal(schema)
	if err != nil {
		return nil, err
	}
	var related []Page
	for _, link := range p.Related {
		if child, ok := c.Get(link); ok {
			related = append(related, child)
		}
	}
	label := "打开视频工作台"
	if p.Target == "/canvas" {
		label = "打开 AI 无限画布"
	}
	if p.Target == "/projects" {
		label = "打开短剧项目"
	}
	assetHash := sha256.Sum256(append(append([]byte(nil), asset("site.css")...), asset("site.js")...))
	view := struct {
		Page
		Brand, Canonical, Origin, Parent, ParentName, Action, ActionLabel, AssetVersion string
		RelatedPages                                                                    []Page
		Schema                                                                          template.JS
	}{
		Page: p, Brand: brand, Canonical: canonical, Origin: origin, Parent: parent, ParentName: parentName, Action: LoginURL(p.Target), ActionLabel: label, AssetVersion: fmt.Sprintf("%x", assetHash[:8]), RelatedPages: related,
		// json.Marshal escapes HTML delimiters, including </script>. Only this
		// serialized structured value is marked safe, never authored raw HTML.
		Schema: template.JS(encoded),
	}
	var out bytes.Buffer
	if err := pageTemplate.Execute(&out, view); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}
