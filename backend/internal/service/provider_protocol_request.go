package service

import (
	"strconv"
	"strings"

	"infinite-canvas/backend/internal/protocol"
)

// protocolRequestFromInput 只负责将生成输入归一化为声明式协议合同；
// 网络执行、轮询和结果下载仍由 provider 运行时统一管理。
func protocolRequestFromInput(input canvasGenerationInput) protocol.GenerationRequest {
	request := protocol.GenerationRequest{
		Model:         input.Config.Model,
		Prompt:        input.Prompt,
		Images:        protocolVideoImageReferences(input),
		Videos:        protocolMediaReferences(input.ReferenceVideos, "video"),
		Audios:        protocolMediaReferences(input.ReferenceAudios, "audio"),
		AspectRatio:   input.Config.Size,
		Resolution:    input.Config.VQuality,
		Quality:       input.Config.Quality,
		GenerateAudio: parseBool(input.Config.VideoGenerateAudio, false),
		Watermark:     parseBool(input.Config.VideoWatermark, false),
		Operation:     firstNonEmpty(metadataString(input.Metadata, "videoEditOperation"), metadataString(input.Metadata, "videoOperation")),
		Extra: map[string]any{
			"videoSeconds": input.Config.VideoSeconds,
			"audioVoice":   input.Config.AudioVoice,
			"audioFormat":  input.Config.AudioFormat,
			"count":        input.Config.Count,
		},
	}
	if input.MaxOutputTokens > 0 {
		request.Extra["max_output_tokens"] = input.MaxOutputTokens
		request.Extra["max_tokens"] = input.MaxOutputTokens
	}
	if duration, err := strconv.Atoi(strings.TrimSpace(input.Config.VideoSeconds)); err == nil && duration > 0 {
		request.Duration = duration
	}
	if count, err := strconv.Atoi(strings.TrimSpace(input.Config.Count)); err == nil && count > 0 {
		request.ImageCount = count
	}
	copyProtocolVideoOptions(request.Extra, input.Metadata)
	return request
}

func copyProtocolVideoOptions(extra map[string]any, metadata map[string]interface{}) {
	if extra == nil || metadata == nil {
		return
	}
	aliases := map[string][]string{
		"frames":                  {"frames", "videoFrames"},
		"seed":                    {"seed", "videoSeed"},
		"camera_fixed":            {"camera_fixed", "cameraFixed"},
		"return_last_frame":       {"return_last_frame", "returnLastFrame"},
		"service_tier":            {"service_tier", "serviceTier"},
		"execution_expires_after": {"execution_expires_after", "executionExpiresAfter"},
		"draft":                   {"draft", "videoDraft"},
		"priority":                {"priority", "videoPriority"},
		"safety_identifier":       {"safety_identifier", "safetyIdentifier"},
	}
	for target, keys := range aliases {
		for _, key := range keys {
			if value, exists := metadata[key]; exists && value != nil {
				extra[target] = value
				break
			}
		}
	}
}

func protocolVideoImageReferences(input canvasGenerationInput) []protocol.MediaReference {
	result := make([]protocol.MediaReference, 0, len(input.ReferenceImages))
	fallbackRole := ""
	if metadataString(input.Metadata, "videoStartFrameNodeId") != "" || metadataString(input.Metadata, "videoEndFrameNodeId") != "" {
		fallbackRole = "reference_image"
	}
	for _, value := range input.ReferenceImages {
		item := protocol.MediaReference{
			ID:      strings.TrimSpace(value.ID),
			URL:     strings.TrimSpace(value.URL),
			DataURL: strings.TrimSpace(value.DataURL),
			Kind:    "image",
			Role:    videoImageRoleOrDefault(input, value, fallbackRole),
		}
		if item.URL != "" || item.DataURL != "" {
			result = append(result, item)
		}
	}
	return result
}

func protocolMediaReferences(values []providerMedia, kind string) []protocol.MediaReference {
	result := make([]protocol.MediaReference, 0, len(values))
	for _, value := range values {
		item := protocol.MediaReference{ID: strings.TrimSpace(value.ID), URL: strings.TrimSpace(value.URL), DataURL: strings.TrimSpace(value.DataURL), Kind: kind}
		if item.URL != "" || item.DataURL != "" {
			result = append(result, item)
		}
	}
	return result
}
