package app

import (
	"encoding/json"
	"strings"
	"testing"
	"yingce/backend/internal/model"
)

func TestTaskMediaSpecSurvivesPublicInputWithoutConfig(t *testing.T) {
	input := map[string]any{"mode": "video", "config": map[string]any{"vquality": "480p", "size": "4:3", "apiKey": "never-expose"}, "metadata": map[string]any{"submittedMediaSpec": map[string]any{"resolution": "4K"}}}
	captureTaskMediaSpec(input)
	raw, _ := json.Marshal(input)
	safe := publicTaskInputJSON(string(raw))
	if strings.Contains(safe, "never-expose") || strings.Contains(safe, "config") {
		t.Fatal("protected config leaked")
	}
	spec := taskSummaryForOutput(model.Task{InputJSON: safe}).SubmittedMediaSpec
	if spec == nil || spec.Resolution != "480p" || spec.AspectRatio != "4:3" {
		t.Fatalf("lost submitted spec: %+v", spec)
	}
}
func TestTaskMediaSpecNeverGuessesOrTrustsArbitraryText(t *testing.T) {
	if taskMediaSpecForOutput(`{"metadata":{}}`) != nil {
		t.Fatal("legacy spec fabricated")
	}
	input := map[string]any{"mode": "image", "config": map[string]any{"imageResolution": "2k", "size": "16:9"}}
	captureTaskMediaSpec(input)
	raw, _ := json.Marshal(input)
	spec := taskMediaSpecForOutput(string(raw))
	if spec == nil || spec.Resolution != "2k" {
		t.Fatal("image tier lost")
	}
	if safeTaskMediaSpec(TaskMediaSpec{Resolution: "https://secret.invalid", AspectRatio: "private-value"}) != nil {
		t.Fatal("unsafe values accepted")
	}
}
