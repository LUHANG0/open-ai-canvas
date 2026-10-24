package app

import (
	"fmt"
	"strings"
)

// 新增分辨率声明时补齐原 Drama 模型的尺寸映射，保留管理员已选比例与数量。
// 已配置分辨率或明确编辑过的映射不重新初始化。
func completeDramaImageCapability(image *ImageCapabilityConfig, protocol string) {
	if protocol != "drama-image" && protocol != "drama-gemini-image" || image.Parameters == nil {
		return
	}
	for _, field := range image.Parameters {
		if field.Name == "imageResolution" {
			return
		}
	}
	image.Resolution = ImageResolutionConfig{Supported: true, Values: []string{"1k", "2k", "4k"}, Default: "1k"}
	if len(image.Size.Presets) == 0 {
		for _, preset := range openAIImageDefaultSizePresets() {
			if len(image.Size.Values) == 0 || containsCapabilityString(image.Size.Values, preset.Ratio) || containsCapabilityString(image.Size.Values, preset.Size) {
				image.Size.Presets = append(image.Size.Presets, preset)
			}
		}
	}
}

func validateDramaVideoCapability(video *VideoCapabilityConfig, modelName string) error {
	name := strings.ToLower(strings.TrimSpace(modelName))
	switch name {
	case "seedance2.0-a", "seedance2.5-a", "seedance2.0-fast-a", "seedance2.0-mini-a":
	default:
		return BadAuthRequest("Drama A 协议仅适用于 seedance2.0-A、seedance2.0-fast-A、seedance2.0-Mini-A 和 seedance2.5-A")
	}
	if video.GenerateAudio.Supported || video.Watermark.Supported {
		return BadAuthRequest("Drama A 系列未声明声音或水印参数，请关闭对应能力开关")
	}
	if len(video.Resolutions) == 0 || video.DefaultResolution == "" || len(video.Ratios) == 0 || video.DefaultRatio == "" {
		return BadAuthRequest("Drama A 视频必须配置可用分辨率、画幅与对应默认值；Fast/Mini 请按平台控制台填写")
	}
	if name != "seedance2.0-a" && name != "seedance2.5-a" {
		return nil // Fast/Mini 的实际档位以控制台为准，不套用标准版限制。
	}
	limit := DefaultModelCapabilityConfigForModel("drama-seedance-a", modelName).Video
	for _, value := range video.Resolutions {
		if !containsCapabilityString(limit.Resolutions, value) {
			return BadAuthRequest(fmt.Sprintf("%s 不支持分辨率 %s", modelName, value))
		}
	}
	for _, value := range video.Ratios {
		if !containsCapabilityString(limit.Ratios, value) {
			return BadAuthRequest(fmt.Sprintf("%s 不支持画幅 %s", modelName, value))
		}
	}
	validDuration := func(value int) bool { return value >= limit.Duration.Min && value <= limit.Duration.Max }
	if !validDuration(video.Duration.Default) || video.Duration.Selection == "range" && (!validDuration(video.Duration.Min) || !validDuration(video.Duration.Max)) {
		return BadAuthRequest(fmt.Sprintf("%s 时长必须在 %d～%d 秒之间", modelName, limit.Duration.Min, limit.Duration.Max))
	}
	for _, value := range video.Duration.Values {
		if !validDuration(value) {
			return BadAuthRequest(fmt.Sprintf("%s 时长必须在 %d～%d 秒之间", modelName, limit.Duration.Min, limit.Duration.Max))
		}
	}
	if video.References.MaxImages > limit.References.MaxImages || video.References.MaxVideos > limit.References.MaxVideos || video.References.MaxAudios > limit.References.MaxAudios {
		return BadAuthRequest(fmt.Sprintf("%s 的参考素材上限为 %d 张图片、%d 个视频、%d 个音频", modelName, limit.References.MaxImages, limit.References.MaxVideos, limit.References.MaxAudios))
	}
	return nil
}
