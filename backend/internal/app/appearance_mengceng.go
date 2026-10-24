package app

import (
	"regexp"
	"strings"
)

// Only known built-in values migrate; operator copy and uploaded resources stay intact.
func migrateMengCengAppearance(value *AppearanceSetting) {
	if value.SchemaVersion >= 12 {
		return
	}
	if value.BrandName == "影策" {
		value.BrandName = defaultAppearanceBrandName
	}
	if value.BrandSlug == "open-ai-canvas" {
		value.BrandSlug = defaultAppearanceBrandSlug
	}
	if value.SEOTitle == "影策" {
		value.SEOTitle = "梦层 MengCeng"
	}
	if value.SEODescription == "影策，面向 AI 影视与短剧创作的工作台。" {
		value.SEODescription = "梦层 MengCeng，面向独立创作者与小型团队的 AI 影像创作工作台。"
	}
	if regexp.MustCompile(`^© \d{4} 影策\. All rights reserved\.$`).MatchString(value.FooterCopyright) {
		value.FooterCopyright = strings.Replace(value.FooterCopyright, "影策", "梦层 MengCeng", 1)
	}
	if value.Canvas.AgentName == "影策" {
		value.Canvas.AgentName = "梦层"
	}
}
