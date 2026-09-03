package service

import "testing"

func TestProtocolRequestFromInputNormalizesOptionsAndDropsEmptyMedia(t *testing.T) {
	request := protocolRequestFromInput(canvasGenerationInput{
		Prompt: "make it move",
		Config: providerConfig{
			Model: "video-model", Size: "16:9", VQuality: "1080p", Quality: "high",
			VideoSeconds: " 12 ", Count: " 3 ", VideoGenerateAudio: "true", VideoWatermark: "true",
			AudioVoice: "voice-1", AudioFormat: "mp3",
		},
		ReferenceVideos: []providerMedia{{ID: "video-1", URL: "https://example.com/video.mp4"}, {ID: "empty"}},
		ReferenceAudios: []providerMedia{{ID: "audio-1", DataURL: "data:audio/mpeg;base64,AA=="}, {ID: "empty"}},
		MaxOutputTokens: 2048,
		Metadata: map[string]interface{}{
			"videoOperation":   "reference_to_video",
			"videoFrames":      144,
			"cameraFixed":      true,
			"serviceTier":      "priority",
			"videoPriority":    7,
			"safetyIdentifier": "user-safe-id",
		},
	})

	if request.Model != "video-model" || request.Prompt != "make it move" || request.Duration != 12 || request.ImageCount != 3 || !request.GenerateAudio || !request.Watermark {
		t.Fatalf("normalized request = %#v", request)
	}
	if len(request.Videos) != 1 || request.Videos[0].ID != "video-1" || len(request.Audios) != 1 || request.Audios[0].ID != "audio-1" {
		t.Fatalf("media references = videos %#v, audios %#v", request.Videos, request.Audios)
	}
	for key, want := range map[string]interface{}{
		"max_output_tokens": 2048,
		"max_tokens":        2048,
		"frames":            144,
		"camera_fixed":      true,
		"service_tier":      "priority",
		"priority":          7,
		"safety_identifier": "user-safe-id",
	} {
		if got := request.Extra[key]; got != want {
			t.Fatalf("request.Extra[%q] = %#v, want %#v", key, got, want)
		}
	}
}
