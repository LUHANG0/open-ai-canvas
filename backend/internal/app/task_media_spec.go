package app

import (
	"encoding/json"
	"regexp"
	"strings"
)

// Safe submitted display options, captured from normalized config before secrets
// are protected. Never retain arbitrary config or infer them from output pixels.
type TaskMediaSpec struct {
	Resolution  string `json:"resolution,omitempty"`
	AspectRatio string `json:"aspectRatio,omitempty"`
}

var mediaResolutionPattern = regexp.MustCompile(`(?i)^(?:[1-9][0-9]{0,3}p|[1-9][0-9]?k|[1-9][0-9]{1,4}[x×][1-9][0-9]{1,4}|auto)$`)
var mediaAspectPattern = regexp.MustCompile(`^[1-9][0-9]?:[1-9][0-9]?$`)

func safeTaskMediaSpec(spec TaskMediaSpec) *TaskMediaSpec {
	spec.Resolution = strings.TrimSpace(spec.Resolution)
	spec.AspectRatio = strings.TrimSpace(spec.AspectRatio)
	if !mediaResolutionPattern.MatchString(spec.Resolution) {
		spec.Resolution = ""
	}
	if !mediaAspectPattern.MatchString(spec.AspectRatio) {
		spec.AspectRatio = ""
	}
	if spec.Resolution == "" && spec.AspectRatio == "" {
		return nil
	}
	return &spec
}

func captureTaskMediaSpec(input map[string]any) {
	metadata, _ := input["metadata"].(map[string]any)
	if metadata == nil {
		metadata = map[string]any{}
		input["metadata"] = metadata
	}
	// Ignore a client-provided snapshot; derive only from admitted config.
	delete(metadata, "submittedMediaSpec")
	config, _ := input["config"].(map[string]any)
	mode, _ := input["mode"].(string)
	spec := TaskMediaSpec{AspectRatio: stringValue(config["size"])}
	switch mode {
	case "image":
		spec.Resolution = stringValue(config["imageResolution"])
	case "video":
		spec.Resolution = stringValue(config["vquality"])
	default:
		return
	}
	if safe := safeTaskMediaSpec(spec); safe != nil {
		metadata["submittedMediaSpec"] = safe
	}
}

func taskMediaSpecForOutput(raw string) *TaskMediaSpec {
	var input struct {
		Metadata struct {
			Spec TaskMediaSpec `json:"submittedMediaSpec"`
		} `json:"metadata"`
	}
	if json.Unmarshal([]byte(raw), &input) != nil {
		return nil
	}
	return safeTaskMediaSpec(input.Metadata.Spec)
}
