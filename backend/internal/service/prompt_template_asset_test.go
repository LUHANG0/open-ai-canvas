package service

import (
	"strings"
	"testing"
)

func TestProjectAssetExtractPromptHasProtectedSourceAndSchema(t *testing.T) {
	definition, ok := promptDefinition(promptOperationProjectAssetExtract)
	if !ok || definition.SchemaKey != "project-asset-breakdown/v1" || definition.OutputType != "json" {
		t.Fatalf("unexpected asset prompt definition: %+v", definition)
	}
	context := protectedPromptContext(promptOperationProjectAssetExtract, map[string]string{
		"项目名称": "夜灯",
		"章节名称": "归家",
		"项目画风": "写实电影感",
		"章节正文": "林夏拿着黄铜钥匙走进老楼道。",
	})
	for _, expected := range []string{"林夏拿着黄铜钥匙", "project-asset-breakdown/v1", `"environment"`, "其他分类的 character 必须为 null"} {
		if !strings.Contains(context, expected) {
			t.Fatalf("protected context is missing %q: %s", expected, context)
		}
	}
}

func TestProjectAssetExtractResultValidatesCategorySpecificContract(t *testing.T) {
	valid := map[string]interface{}{"text": `{"assets":[{"name":"黄铜钥匙","aliases":[],"category":"prop","description":"开门道具","visualPrompt":"磨损黄铜钥匙","continuityNotes":"齿形固定","sourceEvidence":"林夏用钥匙开门","character":null}]}`}
	if err := validatePromptTemplateResult(promptOperationProjectAssetExtract, valid); err != nil {
		t.Fatalf("valid asset result was rejected: %v", err)
	}
	invalid := map[string]interface{}{"text": `{"assets":[{"name":"林夏","aliases":[],"category":"character","description":"主角","visualPrompt":"米色风衣","continuityNotes":"服装固定","sourceEvidence":"林夏出场","character":null}]}`}
	if err := validatePromptTemplateResult(promptOperationProjectAssetExtract, invalid); err == nil || !strings.Contains(err.Error(), "完整 character 对象") {
		t.Fatalf("invalid character asset result was accepted: %v", err)
	}
}
