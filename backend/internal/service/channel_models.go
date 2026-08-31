package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"infinite-canvas/backend/internal/model"
	"infinite-canvas/backend/internal/protocol"
	"infinite-canvas/backend/internal/repository"

	"gorm.io/gorm"
)

type ChannelModelRequest struct {
	ModelKey                     string                         `json:"modelKey"`
	ProviderModelKey             string                         `json:"providerModelKey"`
	DisplayName                  string                         `json:"displayName"`
	Icon                         string                         `json:"icon"`
	Capability                   string                         `json:"capability"`
	Protocol                     string                         `json:"protocol"`
	BillingMode                  string                         `json:"billingMode"`
	UnitPriceMicrocredits        int64                          `json:"unitPriceMicrocredits"`
	InputTokenPriceMicrocredits  int64                          `json:"inputTokenPriceMicrocredits"`
	OutputTokenPriceMicrocredits int64                          `json:"outputTokenPriceMicrocredits"`
	CachedTokenPriceMicrocredits int64                          `json:"cachedTokenPriceMicrocredits"`
	PriceEntryMode               string                         `json:"priceEntryMode"`
	UpstreamDiscountBasisPoints  int                            `json:"upstreamDiscountBasisPoints"`
	DiscountIncrementBasisPoints int                            `json:"discountIncrementBasisPoints"`
	PriceConfigured              bool                           `json:"priceConfigured"`
	Enabled                      *bool                          `json:"enabled"`
	CapabilityConfig             *ModelCapabilityConfig         `json:"capabilityConfig"`
	PriceTiers                   []ChannelModelPriceTierRequest `json:"priceTiers"`
	ExpectedPriceVersion         *int64                         `json:"expectedPriceVersion"`
}

// ChannelModelPriceTierRequest 是系统渠道内某个规格的上游 SKU 与结算价格。
// Resolution="*"、VideoSeconds=0 分别表示任意分辨率和任意时长。
type ChannelModelPriceTierRequest struct {
	// Selector 是 SKU 的规范匹配条件。支持 operation、quality、size、vquality、videoSeconds、imageCount；
	// operation 可区分文生/图生/视频生，避免同一分辨率下错误复用价格。
	Selector                             map[string]string `json:"selector"`
	Resolution                           string            `json:"resolution"`
	VideoSeconds                         int               `json:"videoSeconds"`
	ProviderModelKey                     string            `json:"providerModelKey"`
	BillingMode                          string            `json:"billingMode"`
	UnitPriceMicrocredits                int64             `json:"unitPriceMicrocredits"`
	InputTokenPriceMicrocredits          int64             `json:"inputTokenPriceMicrocredits"`
	OutputTokenPriceMicrocredits         int64             `json:"outputTokenPriceMicrocredits"`
	CachedTokenPriceMicrocredits         int64             `json:"cachedTokenPriceMicrocredits"`
	OriginalUnitPriceMicrocredits        int64             `json:"originalUnitPriceMicrocredits"`
	OriginalInputTokenPriceMicrocredits  int64             `json:"originalInputTokenPriceMicrocredits"`
	OriginalOutputTokenPriceMicrocredits int64             `json:"originalOutputTokenPriceMicrocredits"`
	OriginalCachedTokenPriceMicrocredits int64             `json:"originalCachedTokenPriceMicrocredits"`
	PriceConfigured                      bool              `json:"priceConfigured"`
	Enabled                              *bool             `json:"enabled"`
}

// AdminChannelModelFetchResult 是管理员从上游拉目录后的汇总：models 为去重后的标识，added 为本次新建条数。
type AdminChannelModelFetchResult struct {
	Models []string `json:"models"`
	Added  int64    `json:"added"`
}

type AdminChannelModelTestResult struct {
	DurationMs int64 `json:"durationMs"`
}

func (s *Service) EnsureSystemChannelModels() error {
	channels, err := s.repo.SystemChannels(true)
	if err != nil {
		return err
	}
	for index := range channels {
		items, err := s.repo.ChannelModels(channels[index].ID, true)
		if err != nil {
			return err
		}
		if len(items) == 0 {
			if err := s.syncInitialChannelModels(&channels[index], channelModelNames(channels[index])); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *Service) AdminChannelModels(actor *model.User, channelID string) ([]model.ChannelModel, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if _, err := s.adminSystemChannel(channelID); err != nil {
		return nil, err
	}
	items, err := s.ensureChannelModels(channelID, true)
	if err != nil {
		return nil, err
	}
	for index := range items {
		if strings.TrimSpace(items[index].CapabilityConfigJSON) == "" {
			continue
		}
		config, decodeErr := DecodeModelCapabilityConfig(items[index].CapabilityConfigJSON)
		if decodeErr != nil || config == nil {
			continue
		}
		normalized, normalizeErr := NormalizeModelCapabilityConfigForModel(items[index].Capability, string(items[index].Protocol), firstNonEmpty(items[index].ProviderModelKey, items[index].ModelKey), config)
		if normalizeErr != nil || normalized == nil {
			continue
		}
		encoded, encodeErr := json.Marshal(normalized)
		var value map[string]any
		if encodeErr == nil && json.Unmarshal(encoded, &value) == nil {
			items[index].CapabilityConfig = value
		}
	}
	return items, nil
}

func (s *Service) SystemChannelModel(channelID string, modelKey string) (*model.ChannelModel, error) {
	return s.repo.ChannelModelByKey(channelID, strings.TrimPrefix(strings.TrimSpace(modelKey), "models/"))
}

// SystemChannelHasProtocol 用于没有携带 model 字段的轮询请求：先确认渠道确实配置了该协议，
// 再由 handler 按协议限定请求路径，避免用空模型绕过系统渠道授权。
func (s *Service) SystemChannelHasProtocol(channelID string, protocol model.ChannelInterfaceType) (bool, error) {
	items, err := s.repo.ChannelModels(channelID, false)
	if err != nil {
		return false, err
	}
	for _, item := range items {
		if item.Protocol == protocol {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) FetchAdminChannelModels(ctx context.Context, actor *model.User, channelID string) (*AdminChannelModelFetchResult, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	channel, err := s.adminSystemChannel(channelID)
	if err != nil {
		return nil, err
	}
	headers, err := ParseOutboundHeadersJSON(channel.HeadersJSON)
	if err != nil {
		return nil, err
	}
	// 使用服务端保存的渠道密钥和请求头访问上游，避免敏感配置再次经过浏览器。
	models, err := s.FetchChannelModels(ctx, actor, ChannelModelsRequest{BaseURL: channel.BaseURL, AllowLocalChannel: channel.AllowLocalChannel, APIKey: channel.APIKey, APIFormat: channel.APIFormat, Headers: headers})
	if err != nil {
		return nil, err
	}
	// 只按当前未删除记录去重；普通手动删除的模型仍可重新拉取，已合并进模型家族的 SKU 除外。
	existing, err := s.repo.ChannelModels(channelID, true)
	if err != nil {
		return nil, err
	}
	known := make(map[string]struct{}, len(existing))
	for _, item := range existing {
		known[channelModelCatalogKey(item.ModelKey)] = struct{}{}
	}
	retired := retiredChannelModelKeys(channel.RetiredModelsJSON)
	missing := make([]model.ChannelModel, 0, len(models))
	for _, name := range models {
		name = strings.TrimPrefix(strings.TrimSpace(name), "models/")
		key := channelModelCatalogKey(name)
		if _, ok := known[key]; ok || retired[key] {
			continue
		}
		// 自动发现不能绕过定价边界；新模型由管理员定价后再手动启用。
		modelID, idErr := s.repo.NextPrefixedID("MODEL")
		if idErr != nil {
			return nil, idErr
		}
		missing = append(missing, model.ChannelModel{ID: modelID, ChannelID: channelID, ModelKey: name, DisplayName: name, BillingMode: "fixed_request", Enabled: false, PriceVersion: 1})
	}
	added, err := s.repo.CreateMissingChannelModels(missing)
	if err != nil {
		return nil, err
	}
	if added > 0 {
		s.invalidateRouteCatalog()
	}
	return &AdminChannelModelFetchResult{Models: models, Added: added}, nil
}

func (s *Service) SaveAdminChannelModel(actor *model.User, channelID string, id string, req ChannelModelRequest) (*model.ChannelModel, error) {
	action := "save"
	if strings.TrimSpace(id) == "" {
		action = "create"
	}
	return s.saveAdminChannelModel(actor, channelID, id, req, action, "")
}

func (s *Service) saveAdminChannelModel(actor *model.User, channelID string, id string, req ChannelModelRequest, revisionAction string, restoredFromRevisionID string) (*model.ChannelModel, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	channel, err := s.repo.AdminSystemChannel(channelID)
	if err != nil {
		return nil, err
	}
	priceEntryMode, err := normalizeChannelModelPriceEntry(req)
	if err != nil {
		return nil, err
	}
	modelKey, providerModelKey, capability, protocol, err := s.normalizeChannelModelContract(channel, req)
	if err != nil {
		return nil, err
	}
	// 先检查同渠道重复模型，避免无关能力校验或生成无用序列号掩盖真正的冲突。
	conflict, conflictErr := s.repo.ChannelModelByKeyIncludingDisabled(channelID, modelKey)
	if conflictErr != nil && !errors.Is(conflictErr, gorm.ErrRecordNotFound) {
		return nil, conflictErr
	}
	if conflict != nil && conflict.ID != strings.TrimSpace(id) {
		return nil, BadAuthRequest("该渠道已存在模型 " + modelKey + "，请直接编辑已有模型")
	}
	if capability == "text" || capability == "image" || capability == "video" {
		if _, err := NormalizeModelCapabilityConfigForModel(capability, string(protocol), providerModelKey, req.CapabilityConfig); err != nil {
			return nil, err
		}
	}
	tiers, err := s.normalizeChannelModelPriceTiers(req, capability, protocol, providerModelKey)
	if err != nil {
		return nil, err
	}
	creating := strings.TrimSpace(id) == ""
	var baseline *model.ChannelModelRevision
	var expectedPriceVersion *int64
	var item *model.ChannelModel
	if creating {
		modelID, idErr := s.repo.NextPrefixedID("MODEL")
		if idErr != nil {
			return nil, idErr
		}
		item = &model.ChannelModel{ID: modelID, ChannelID: channelID, Enabled: true, PriceVersion: 1}
	} else {
		item, err = s.repo.ChannelModelByID(channelID, id)
		if err != nil {
			return nil, err
		}
		if req.ExpectedPriceVersion == nil {
			return nil, BadAuthRequest("缺少价格配置版本，请刷新页面后重试")
		}
		if *req.ExpectedPriceVersion != item.PriceVersion {
			return nil, NewAppError(http.StatusConflict, "该模型配置已被其他页面更新，请刷新后再保存")
		}
		expectedPriceVersion = req.ExpectedPriceVersion
		baseline, err = newChannelModelRevision(actor, item, item.PriceTiers, "baseline", "")
		if err != nil {
			return nil, err
		}
		item.PriceVersion = *expectedPriceVersion + 1
	}
	item.ModelKey = modelKey
	item.ProviderModelKey = providerModelKey
	item.DisplayName = strings.TrimSpace(req.DisplayName)
	if item.DisplayName == "" {
		item.DisplayName = modelKey
	}
	item.Icon = strings.TrimSpace(req.Icon)
	item.Capability = capability
	item.Protocol = protocol
	item.PriceEntryMode = priceEntryMode
	item.UpstreamDiscountBasisPoints = req.UpstreamDiscountBasisPoints
	item.DiscountIncrementBasisPoints = req.DiscountIncrementBasisPoints
	s.applyChannelModelPriceTierSummary(item, tiers)
	if capability == "text" || capability == "image" || capability == "video" {
		capabilityConfig, normalizeErr := NormalizeModelCapabilityConfigForModel(capability, string(protocol), providerModelKey, req.CapabilityConfig)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		encoded, encodeErr := json.Marshal(capabilityConfig)
		if encodeErr != nil {
			return nil, encodeErr
		}
		if item.CapabilityConfigJSON != string(encoded) {
			item.CapabilityVersion++
		}
		item.CapabilityConfigJSON = string(encoded)
	} else {
		item.CapabilityConfigJSON = ""
		item.CapabilityVersion = 0
	}
	if req.Enabled != nil {
		item.Enabled = *req.Enabled
	}
	if err := validateChannelModelTierCapabilities(tiers, item.CapabilityConfigJSON, capability); err != nil {
		return nil, err
	}
	item.PriceTiers = tiers
	revision, err := newChannelModelRevision(actor, item, tiers, revisionAction, restoredFromRevisionID)
	if err != nil {
		return nil, err
	}
	auditAction := map[string]string{"create": "channel_model.create", "restore": "channel_model.restore"}[revisionAction]
	if auditAction == "" {
		auditAction = "channel_model.update"
	}
	audit, err := newAdminAuditEvent(actor, auditAction, "channel_model", item.ID, "保存系统渠道模型及价格配置", map[string]any{
		"channelId": channelID, "priceVersion": item.PriceVersion, "revisionId": revision.ID, "restoredFromRevisionId": restoredFromRevisionID,
	})
	if err != nil {
		return nil, err
	}
	// 渠道模型、所有价格档、不可变历史与审计必须同时落库。
	if err := s.repo.SaveChannelModelConfiguration(item, tiers, expectedPriceVersion, baseline, revision, audit); err != nil {
		if repository.IsChannelModelVersionConflict(err) {
			return nil, NewAppError(http.StatusConflict, "该模型配置已被其他页面更新，请刷新后再保存")
		}
		return nil, err
	}
	s.invalidateRouteCatalog()
	if err := s.syncChannelModelNames(channel); err != nil {
		return nil, err
	}
	if err := s.syncLogicalModelsFromChannelModel(actor, item); err != nil {
		return nil, err
	}
	return item, nil
}

func normalizeChannelModelPriceEntry(req ChannelModelRequest) (string, error) {
	mode := strings.ToLower(strings.TrimSpace(req.PriceEntryMode))
	if mode == "" {
		mode = "direct"
	}
	if mode != "direct" && mode != "discount" {
		return "", BadAuthRequest("价格录入方式仅支持直接填写或原价换算")
	}
	if req.UpstreamDiscountBasisPoints < 0 || req.UpstreamDiscountBasisPoints > 10_000 || req.DiscountIncrementBasisPoints < 0 || req.DiscountIncrementBasisPoints > 10_000 {
		return "", BadAuthRequest("折扣必须在 0 到 10 折之间")
	}
	if mode == "discount" {
		if req.UpstreamDiscountBasisPoints <= 0 {
			return "", BadAuthRequest("原价换算时上游折扣必须大于 0")
		}
		if req.UpstreamDiscountBasisPoints+req.DiscountIncrementBasisPoints > 10_000 {
			return "", BadAuthRequest("最终售价折扣不能超过 10 折")
		}
	}
	return mode, nil
}

func newChannelModelRevision(actor *model.User, item *model.ChannelModel, tiers []model.ChannelModelPriceTier, action string, restoredFromRevisionID string) (*model.ChannelModelRevision, error) {
	if actor == nil {
		return nil, Unauthorized("请先登录")
	}
	snapshotTiers := append([]model.ChannelModelPriceTier(nil), tiers...)
	for index := range snapshotTiers {
		// 快照记录的是可恢复配置，不固化会在保存时复用或重分配的持久化身份。
		snapshotTiers[index].ID = ""
		snapshotTiers[index].ChannelModelID = ""
		snapshotTiers[index].PriceVersion = 0
		snapshotTiers[index].CreatedAt = time.Time{}
		snapshotTiers[index].UpdatedAt = time.Time{}
		snapshotTiers[index].DeletedAt = gorm.DeletedAt{}
	}
	snapshot := model.ChannelModelRevisionSnapshot{
		ModelKey: item.ModelKey, ProviderModelKey: item.ProviderModelKey, DisplayName: item.DisplayName, Icon: item.Icon,
		Capability: item.Capability, Protocol: item.Protocol, BillingMode: item.BillingMode,
		UnitPriceMicrocredits: item.UnitPriceMicrocredits, InputTokenPriceMicrocredits: item.InputTokenPriceMicrocredits,
		OutputTokenPriceMicrocredits: item.OutputTokenPriceMicrocredits, CachedTokenPriceMicrocredits: item.CachedTokenPriceMicrocredits,
		PriceEntryMode: item.PriceEntryMode, UpstreamDiscountBasisPoints: item.UpstreamDiscountBasisPoints,
		DiscountIncrementBasisPoints: item.DiscountIncrementBasisPoints, PriceConfigured: item.PriceConfigured,
		Enabled: item.Enabled, PriceVersion: item.PriceVersion, CapabilityConfigJSON: item.CapabilityConfigJSON,
		CapabilityVersion: item.CapabilityVersion, PriceTiers: snapshotTiers,
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	return &model.ChannelModelRevision{
		ID: newID(), ChannelModelID: item.ID, Version: item.PriceVersion, Action: strings.TrimSpace(action),
		RestoredFromRevisionID: strings.TrimSpace(restoredFromRevisionID), SnapshotJSON: string(encoded), CreatedBy: actor.ID, CreatedAt: time.Now(),
	}, nil
}

type ChannelModelRestoreRequest struct {
	ExpectedPriceVersion int64 `json:"expectedPriceVersion"`
}

func (s *Service) AdminChannelModelRevisions(actor *model.User, channelID string, channelModelID string) ([]model.ChannelModelRevision, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if _, err := s.adminSystemChannel(channelID); err != nil {
		return nil, err
	}
	if _, err := s.repo.ChannelModelByID(channelID, channelModelID); err != nil {
		return nil, err
	}
	revisions, err := s.repo.ChannelModelRevisions(channelModelID, 50)
	if err != nil {
		return nil, err
	}
	for index := range revisions {
		var snapshot model.ChannelModelRevisionSnapshot
		if err := json.Unmarshal([]byte(revisions[index].SnapshotJSON), &snapshot); err != nil {
			return nil, fmt.Errorf("解析渠道模型历史版本 %s：%w", revisions[index].ID, err)
		}
		revisions[index].Snapshot = &snapshot
	}
	return revisions, nil
}

func (s *Service) RestoreAdminChannelModelRevision(actor *model.User, channelID string, channelModelID string, revisionID string, req ChannelModelRestoreRequest) (*model.ChannelModel, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	if req.ExpectedPriceVersion <= 0 {
		return nil, BadAuthRequest("缺少当前价格配置版本，请刷新页面后重试")
	}
	current, err := s.repo.ChannelModelByID(channelID, channelModelID)
	if err != nil {
		return nil, err
	}
	if current.PriceVersion != req.ExpectedPriceVersion {
		return nil, NewAppError(http.StatusConflict, "该模型配置已被其他页面更新，请刷新后再恢复")
	}
	revision, err := s.repo.ChannelModelRevision(channelModelID, revisionID)
	if err != nil {
		return nil, err
	}
	var snapshot model.ChannelModelRevisionSnapshot
	if err := json.Unmarshal([]byte(revision.SnapshotJSON), &snapshot); err != nil {
		return nil, fmt.Errorf("解析渠道模型历史版本：%w", err)
	}
	restoreRequest, err := channelModelRequestFromRevisionSnapshot(snapshot, req.ExpectedPriceVersion)
	if err != nil {
		return nil, err
	}
	return s.saveAdminChannelModel(actor, channelID, channelModelID, restoreRequest, "restore", revision.ID)
}

func channelModelRequestFromRevisionSnapshot(snapshot model.ChannelModelRevisionSnapshot, expectedPriceVersion int64) (ChannelModelRequest, error) {
	var capabilityConfig *ModelCapabilityConfig
	if strings.TrimSpace(snapshot.CapabilityConfigJSON) != "" {
		var decoded ModelCapabilityConfig
		if err := json.Unmarshal([]byte(snapshot.CapabilityConfigJSON), &decoded); err != nil {
			return ChannelModelRequest{}, fmt.Errorf("解析历史能力配置：%w", err)
		}
		capabilityConfig = &decoded
	}
	tiers := make([]ChannelModelPriceTierRequest, 0, len(snapshot.PriceTiers))
	for _, tier := range snapshot.PriceTiers {
		enabled := tier.Enabled
		tiers = append(tiers, ChannelModelPriceTierRequest{
			Selector: tier.Selector, Resolution: tier.Resolution, VideoSeconds: tier.VideoSeconds, ProviderModelKey: tier.ProviderModelKey,
			BillingMode: tier.BillingMode, UnitPriceMicrocredits: tier.UnitPriceMicrocredits,
			InputTokenPriceMicrocredits: tier.InputTokenPriceMicrocredits, OutputTokenPriceMicrocredits: tier.OutputTokenPriceMicrocredits,
			CachedTokenPriceMicrocredits:         tier.CachedTokenPriceMicrocredits,
			OriginalUnitPriceMicrocredits:        tier.OriginalUnitPriceMicrocredits,
			OriginalInputTokenPriceMicrocredits:  tier.OriginalInputTokenPriceMicrocredits,
			OriginalOutputTokenPriceMicrocredits: tier.OriginalOutputTokenPriceMicrocredits,
			OriginalCachedTokenPriceMicrocredits: tier.OriginalCachedTokenPriceMicrocredits,
			PriceConfigured:                      tier.PriceConfigured, Enabled: &enabled,
		})
	}
	enabled := snapshot.Enabled
	return ChannelModelRequest{
		ModelKey: snapshot.ModelKey, ProviderModelKey: snapshot.ProviderModelKey, DisplayName: snapshot.DisplayName, Icon: snapshot.Icon,
		Capability: snapshot.Capability, Protocol: string(snapshot.Protocol), PriceEntryMode: snapshot.PriceEntryMode,
		UpstreamDiscountBasisPoints: snapshot.UpstreamDiscountBasisPoints, DiscountIncrementBasisPoints: snapshot.DiscountIncrementBasisPoints,
		Enabled: &enabled, CapabilityConfig: capabilityConfig, PriceTiers: tiers, ExpectedPriceVersion: &expectedPriceVersion,
	}, nil
}

func validateChannelModelTierCapabilities(tiers []model.ChannelModelPriceTier, rawCapabilityConfig string, capability string) error {
	if capability != "video" {
		return nil
	}
	config, err := DecodeModelCapabilityConfig(rawCapabilityConfig)
	if err != nil || config == nil || config.Video == nil {
		return BadAuthRequest("视频模型能力配置无效，无法校验价格档规格")
	}
	resolutionSupported := make(map[string]bool, len(config.Video.Resolutions))
	supportedResolutionLabels := make([]string, 0, len(config.Video.Resolutions))
	for _, resolution := range config.Video.Resolutions {
		resolutionSupported[normalizeChannelModelTierResolution(resolution)] = true
		label := strings.ToUpper(strings.TrimSpace(resolution))
		if label != "" {
			supportedResolutionLabels = append(supportedResolutionLabels, label)
		}
	}
	durationSupported := make(map[int]bool, len(config.Video.Duration.Values))
	for _, seconds := range config.Video.Duration.Values {
		durationSupported[seconds] = true
	}
	for _, tier := range tiers {
		if tier.Resolution != "*" && !resolutionSupported[normalizeChannelModelTierResolution(tier.Resolution)] {
			supported := strings.Join(supportedResolutionLabels, "、")
			if supported == "" {
				supported = "未配置"
			}
			requested := strings.ToUpper(strings.TrimSpace(tier.Resolution))
			return BadAuthRequest(fmt.Sprintf("价格档分辨率 %s 与模型能力配置不一致；当前支持：%s。请在“协议参数 > 输出分辨率”中启用 %s，或删除该价格档", requested, supported, requested))
		}
		if tier.VideoSeconds == 0 {
			continue
		}
		if config.Video.Duration.Selection == "enum" && !durationSupported[tier.VideoSeconds] {
			return BadAuthRequest(fmt.Sprintf("价格档时长 %d 秒不在该视频模型支持范围内", tier.VideoSeconds))
		}
		if config.Video.Duration.Selection == "range" && (tier.VideoSeconds < config.Video.Duration.Min || tier.VideoSeconds > config.Video.Duration.Max || (config.Video.Duration.Step > 0 && (tier.VideoSeconds-config.Video.Duration.Min)%config.Video.Duration.Step != 0)) {
			return BadAuthRequest(fmt.Sprintf("价格档时长 %d 秒不在该视频模型支持范围内", tier.VideoSeconds))
		}
	}
	return nil
}

// syncLogicalModelsFromChannelModel 只失效路由目录。系统渠道 SKU 与前台模型目录
// 分别维护：保存渠道模型绝不能自动创建、覆盖或删除前台模型及其线路配置。
func (s *Service) syncLogicalModelsFromChannelModel(actor *model.User, channelModel *model.ChannelModel) error {
	_ = actor
	_ = channelModel
	s.invalidateRouteCatalog()
	return nil
}

func supportsBuiltinTokenBilling(capability string, protocol model.ChannelInterfaceType) bool {
	return capability == "text" || (capability == "video" && protocol == model.ChannelInterfaceVolcengineArkVideo)
}

func (s *Service) supportsTokenBilling(capability string, protocolID model.ChannelInterfaceType) bool {
	if supportsBuiltinTokenBilling(capability, protocolID) {
		return true
	}
	if capability != "video" {
		return false
	}
	metadata, ok := s.channelProtocolMetadata(string(protocolID))
	return ok && metadata.Enabled && metadata.UnavailableReason == "" && metadata.TokenUsage
}

func (s *Service) normalizeChannelModelPriceTiers(req ChannelModelRequest, capability string, protocol model.ChannelInterfaceType, fallbackProviderModelKey string) ([]model.ChannelModelPriceTier, error) {
	inputs := req.PriceTiers
	// 兼容旧管理 API：没有 priceTiers 的请求等价于一个默认价格档。
	if len(inputs) == 0 {
		enabled := true
		inputs = []ChannelModelPriceTierRequest{{
			Resolution: "*", VideoSeconds: 0, ProviderModelKey: fallbackProviderModelKey,
			BillingMode: req.BillingMode, UnitPriceMicrocredits: req.UnitPriceMicrocredits,
			InputTokenPriceMicrocredits: req.InputTokenPriceMicrocredits, OutputTokenPriceMicrocredits: req.OutputTokenPriceMicrocredits,
			CachedTokenPriceMicrocredits:         req.CachedTokenPriceMicrocredits,
			OriginalUnitPriceMicrocredits:        req.UnitPriceMicrocredits,
			OriginalInputTokenPriceMicrocredits:  req.InputTokenPriceMicrocredits,
			OriginalOutputTokenPriceMicrocredits: req.OutputTokenPriceMicrocredits,
			OriginalCachedTokenPriceMicrocredits: req.CachedTokenPriceMicrocredits,
			PriceConfigured:                      req.PriceConfigured, Enabled: &enabled,
		}}
	}
	result := make([]model.ChannelModelPriceTier, 0, len(inputs))
	seen := make(map[string]bool, len(inputs))
	for _, input := range inputs {
		selector, resolution, videoSeconds, selectorErr := normalizeChannelModelTierSelector(capability, input)
		if selectorErr != nil {
			return nil, selectorErr
		}
		_, key, keyErr := model.CanonicalSKUSelector(selector)
		if keyErr != nil {
			return nil, keyErr
		}
		if seen[key] {
			return nil, BadAuthRequest("同一个操作和规格组合只能配置一个价格档")
		}
		seen[key] = true
		billingMode := strings.TrimSpace(input.BillingMode)
		if billingMode == "" {
			billingMode = "fixed_request"
		}
		if err := s.validateChannelModelTierPricing(capability, protocol, billingMode, input); err != nil {
			return nil, err
		}
		if strings.EqualFold(strings.TrimSpace(req.PriceEntryMode), "discount") {
			if (input.UnitPriceMicrocredits > 0 && input.OriginalUnitPriceMicrocredits <= 0) ||
				(input.InputTokenPriceMicrocredits > 0 && input.OriginalInputTokenPriceMicrocredits <= 0) ||
				(input.OutputTokenPriceMicrocredits > 0 && input.OriginalOutputTokenPriceMicrocredits <= 0) ||
				(input.CachedTokenPriceMicrocredits > 0 && input.OriginalCachedTokenPriceMicrocredits <= 0) {
				return nil, BadAuthRequest("原价换算模式下，每个已填写的最终价格都必须保留对应原价")
			}
		}
		id, idErr := s.repo.NextPrefixedID("PTIER")
		if idErr != nil {
			return nil, idErr
		}
		enabled := input.Enabled == nil || *input.Enabled
		result = append(result, model.ChannelModelPriceTier{
			ID:                                   id,
			SelectorKey:                          key,
			SelectorJSON:                         key,
			Selector:                             selector,
			Resolution:                           resolution,
			VideoSeconds:                         videoSeconds,
			ProviderModelKey:                     strings.TrimPrefix(strings.TrimSpace(firstNonEmpty(input.ProviderModelKey, fallbackProviderModelKey)), "models/"),
			BillingMode:                          billingMode,
			UnitPriceMicrocredits:                input.UnitPriceMicrocredits,
			InputTokenPriceMicrocredits:          input.InputTokenPriceMicrocredits,
			OutputTokenPriceMicrocredits:         input.OutputTokenPriceMicrocredits,
			CachedTokenPriceMicrocredits:         input.CachedTokenPriceMicrocredits,
			OriginalUnitPriceMicrocredits:        input.OriginalUnitPriceMicrocredits,
			OriginalInputTokenPriceMicrocredits:  input.OriginalInputTokenPriceMicrocredits,
			OriginalOutputTokenPriceMicrocredits: input.OriginalOutputTokenPriceMicrocredits,
			OriginalCachedTokenPriceMicrocredits: input.OriginalCachedTokenPriceMicrocredits,
			PriceConfigured:                      input.PriceConfigured,
			Enabled:                              enabled,
			PriceVersion:                         1,
		})
	}
	return result, nil
}

func normalizeChannelModelTierSelector(capability string, input ChannelModelPriceTierRequest) (map[string]string, string, int, error) {
	selector := make(map[string]string, len(input.Selector)+3)
	for rawKey, rawValue := range input.Selector {
		key := strings.TrimSpace(rawKey)
		value := strings.TrimSpace(rawValue)
		if key == "" || value == "" {
			continue
		}
		switch key {
		case "operation":
			value = strings.ToLower(value)
		case "quality", "size":
			value = strings.ToLower(value)
			if value == "auto" || value == "any" {
				value = "*"
			}
		case "vquality":
			value = normalizeChannelModelTierResolution(value)
		case "videoSeconds":
			seconds, err := strconv.Atoi(value)
			if err != nil || seconds < 0 {
				return nil, "", 0, BadAuthRequest("视频价格档时长必须是非负整数")
			}
			if seconds == 0 {
				continue
			}
			value = strconv.Itoa(seconds)
		case "imageCount":
			count, err := strconv.Atoi(value)
			if err != nil || count < 0 {
				return nil, "", 0, BadAuthRequest("参考图片数量必须是非负整数")
			}
			if count == 0 {
				continue
			}
			value = strconv.Itoa(count)
		default:
			return nil, "", 0, BadAuthRequest("价格档不支持规格字段：" + key)
		}
		selector[key] = value
	}
	if capability == "video" {
		if _, exists := selector["vquality"]; !exists {
			if resolution := normalizeChannelModelTierResolution(input.Resolution); resolution != "*" {
				selector["vquality"] = resolution
			}
		}
		if _, exists := selector["videoSeconds"]; !exists && input.VideoSeconds > 0 {
			selector["videoSeconds"] = strconv.Itoa(input.VideoSeconds)
		}
	} else if input.Resolution != "" && normalizeChannelModelTierResolution(input.Resolution) != "*" {
		return nil, "", 0, BadAuthRequest("非视频模型不能使用视频分辨率价格档")
	} else if input.VideoSeconds != 0 {
		return nil, "", 0, BadAuthRequest("非视频模型不能使用视频时长价格档")
	}
	for _, key := range []string{"quality", "size"} {
		if _, exists := selector[key]; exists && capability != "image" {
			return nil, "", 0, BadAuthRequest("只有图片模型可以按 " + key + " 配置价格档")
		}
	}
	if _, exists := selector["vquality"]; exists && capability != "video" {
		return nil, "", 0, BadAuthRequest("只有视频模型可以按分辨率配置价格档")
	}
	if _, exists := selector["videoSeconds"]; exists && capability != "video" {
		return nil, "", 0, BadAuthRequest("只有视频模型可以按时长配置价格档")
	}
	if _, exists := selector["imageCount"]; exists && capability != "video" {
		return nil, "", 0, BadAuthRequest("只有视频模型可以按参考图片数量配置价格档")
	}
	resolution := "*"
	if value := selector["vquality"]; value != "" {
		resolution = value
	}
	videoSeconds := 0
	if value := selector["videoSeconds"]; value != "" {
		videoSeconds, _ = strconv.Atoi(value)
	}
	return selector, resolution, videoSeconds, nil
}

func (s *Service) validateChannelModelTierPricing(capability string, protocol model.ChannelInterfaceType, billingMode string, input ChannelModelPriceTierRequest) error {
	if billingMode != "fixed_request" && billingMode != "per_second" && billingMode != "token" {
		return BadAuthRequest("模型计费方式仅支持按次、按秒或 Token")
	}
	if billingMode == "per_second" && capability != "video" {
		return BadAuthRequest("只有视频模型可以按秒计费")
	}
	if billingMode == "token" && !s.supportsTokenBilling(capability, protocol) {
		return BadAuthRequest("Token 计费仅支持文本模型，或能返回真实用量的视频协议")
	}
	if input.UnitPriceMicrocredits < 0 || input.InputTokenPriceMicrocredits < 0 || input.OutputTokenPriceMicrocredits < 0 || input.CachedTokenPriceMicrocredits < 0 ||
		input.OriginalUnitPriceMicrocredits < 0 || input.OriginalInputTokenPriceMicrocredits < 0 || input.OriginalOutputTokenPriceMicrocredits < 0 || input.OriginalCachedTokenPriceMicrocredits < 0 {
		return BadAuthRequest("模型积分价格不能小于 0")
	}
	if !input.PriceConfigured {
		return nil
	}
	const maxTokenPriceMicrocredits = int64(1_000_000) * CreditScale
	if input.InputTokenPriceMicrocredits > maxTokenPriceMicrocredits || input.OutputTokenPriceMicrocredits > maxTokenPriceMicrocredits || input.CachedTokenPriceMicrocredits > maxTokenPriceMicrocredits {
		return BadAuthRequest("Token 每百万用量价格不能超过 1,000,000 积分")
	}
	if input.OriginalInputTokenPriceMicrocredits > maxTokenPriceMicrocredits || input.OriginalOutputTokenPriceMicrocredits > maxTokenPriceMicrocredits || input.OriginalCachedTokenPriceMicrocredits > maxTokenPriceMicrocredits {
		return BadAuthRequest("Token 每百万用量原价不能超过 1,000,000 积分")
	}
	return nil
}

func normalizeChannelModelTierResolution(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" || value == "*" || strings.EqualFold(value, "any") {
		return "*"
	}
	normalized := normalizeModelRequestOption("vquality", value)
	return strings.ToLower(strings.TrimSpace(fmt.Sprint(normalized)))
}

func (s *Service) applyChannelModelPriceTierSummary(item *model.ChannelModel, tiers []model.ChannelModelPriceTier) {
	item.PriceConfigured = false
	item.BillingMode = "fixed_request"
	item.UnitPriceMicrocredits = 0
	item.InputTokenPriceMicrocredits = 0
	item.OutputTokenPriceMicrocredits = 0
	item.CachedTokenPriceMicrocredits = 0
	var summary *model.ChannelModelPriceTier
	for index := range tiers {
		tier := &tiers[index]
		if tier.Enabled && tier.PriceConfigured {
			item.PriceConfigured = true
		}
		if summary == nil || (tier.Resolution == "*" && tier.VideoSeconds == 0) {
			summary = tier
		}
	}
	if summary == nil {
		return
	}
	item.BillingMode = summary.BillingMode
	item.UnitPriceMicrocredits = summary.UnitPriceMicrocredits
	item.InputTokenPriceMicrocredits = summary.InputTokenPriceMicrocredits
	item.OutputTokenPriceMicrocredits = summary.OutputTokenPriceMicrocredits
	item.CachedTokenPriceMicrocredits = summary.CachedTokenPriceMicrocredits
}

func (s *Service) TestAdminChannelModel(ctx context.Context, actor *model.User, channelID string, req ChannelModelRequest) (*AdminChannelModelTestResult, error) {
	if err := s.RequireAdmin(actor); err != nil {
		return nil, err
	}
	channel, err := s.adminSystemChannel(channelID)
	if err != nil {
		return nil, err
	}
	modelKey, providerModelKey, capability, protocol, err := s.normalizeChannelModelContract(channel, req)
	if err != nil {
		return nil, err
	}
	if capability == "text" || capability == "image" || capability == "video" {
		if _, err := NormalizeModelCapabilityConfigForModel(capability, string(protocol), providerModelKey, req.CapabilityConfig); err != nil {
			return nil, err
		}
	}
	if strings.TrimSpace(channel.BaseURL) == "" || strings.TrimSpace(channel.APIKey) == "" {
		return nil, BadAuthRequest("请先在渠道中配置 Base URL 和 API Key")
	}
	if _, err := s.validateChannelOutboundURL(channel.BaseURL, channel.AllowLocalChannel, false); err != nil {
		return nil, err
	}
	headers, err := ParseOutboundHeadersJSON(channel.HeadersJSON)
	if err != nil {
		return nil, err
	}

	prompt := map[string]string{
		"text":  "Reply with OK.",
		"image": "A simple gray circle on a white background.",
		"video": "A static gray circle on a white background.",
		"audio": "Model test.",
	}[capability]
	videoSeconds := "6"
	videoSecondsValue := 6
	if protocol == model.ChannelInterfaceVolcengineJiMengVideo {
		videoSeconds = "5"
		videoSecondsValue = 5
	}
	imageSize, imageQuality := "", ""
	var imageProfile *ImageCapabilityConfig
	if capability == "image" {
		profile, normalizeErr := NormalizeModelCapabilityConfigForModel(capability, string(protocol), providerModelKey, req.CapabilityConfig)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		imageProfile = profile.Image
		imageSize, imageQuality = imageTestDefaults(imageProfile)
	}
	input := canvasGenerationInput{
		Mode:   capability,
		Prompt: prompt,
		Config: providerConfig{
			ChannelID:          channel.ID,
			APIFormat:          channel.APIFormat,
			InterfaceType:      string(protocol),
			BaseURL:            channel.BaseURL,
			AllowLocalChannel:  s.effectiveAllowLocalChannel(channel.AllowLocalChannel),
			APIKey:             channel.APIKey,
			SecretKey:          channel.SecretKey,
			Headers:            headers,
			Model:              providerModelKey,
			ChannelModelKey:    modelKey,
			Size:               map[string]string{"image": imageSize, "video": "16:9"}[capability],
			Quality:            imageQuality,
			Count:              "1",
			VideoSeconds:       videoSeconds,
			VQuality:           "720",
			VideoGenerateAudio: "false",
			VideoWatermark:     "false",
			AudioVoice:         "alloy",
			AudioFormat:        "mp3",
			AudioSpeed:         "1",
		},
		Metadata: map[string]interface{}{},
	}
	if capability == "image" {
		input.ImageCapability = imageProfile
	}

	// 测试复用真实生成协议、运行时并发和熔断策略，但不创建用户任务或计费订单。
	testCtx, cancel := context.WithTimeout(ctx, 10*time.Minute)
	defer cancel()
	testCtx = context.WithValue(testCtx, providerAnalyticsKey{}, providerAnalyticsContext{
		Service: s, Billing: s.taskBilling(), UserID: actor.ID, ChannelID: channel.ID, Capability: capability,
		Operation: "admin_model_test", Model: modelKey, VideoSeconds: videoSecondsValue,
	})
	testCtx = withProviderOutboundPolicy(testCtx, input.Config)
	testCtx = withProtocolRegistry(testCtx, s.protocolRegistry())
	startedAt := time.Now()
	switch capability {
	case "text":
		_, err = runTextTask(testCtx, input)
	case "image":
		_, err = runImageTask(testCtx, input)
	case "video":
		_, err = runVideoTask(testCtx, input)
	case "audio":
		_, err = runAudioTask(testCtx, input)
	}
	if err != nil {
		status := http.StatusBadGateway
		if errors.Is(err, context.DeadlineExceeded) {
			status = http.StatusGatewayTimeout
		}
		return nil, WrapAppError(status, "模型测试失败："+providerUserFacingErrorMessage(err), err)
	}
	return &AdminChannelModelTestResult{DurationMs: time.Since(startedAt).Milliseconds()}, nil
}

// 模型测试必须使用当前模型声明的默认参数，避免固定分辨率 SKU 被通用 1K 测试值误伤。
func imageTestDefaults(profile *ImageCapabilityConfig) (string, string) {
	if profile == nil {
		return "1024x1024", "auto"
	}
	size := ""
	if profile.Size.Parameter != "none" {
		size = strings.TrimSpace(profile.Size.Default)
	}
	quality := ""
	if profile.Quality.Supported {
		quality = strings.TrimSpace(profile.Quality.Default)
	}
	return size, quality
}

func normalizeChannelModelContract(channel *model.ModelChannel, req ChannelModelRequest) (string, string, string, model.ChannelInterfaceType, error) {
	return normalizeChannelModelContractWithRegistry(protocol.Builtins(), channel, req)
}

func (s *Service) normalizeChannelModelContract(channel *model.ModelChannel, req ChannelModelRequest) (string, string, string, model.ChannelInterfaceType, error) {
	return normalizeChannelModelContractWithRegistry(s.protocolRegistry(), channel, req)
}

func normalizeChannelModelContractWithRegistry(registry *protocol.Registry, channel *model.ModelChannel, req ChannelModelRequest) (string, string, string, model.ChannelInterfaceType, error) {
	modelKey := strings.TrimPrefix(strings.TrimSpace(req.ModelKey), "models/")
	if modelKey == "" {
		return "", "", "", "", BadAuthRequest("请填写模型标识")
	}
	providerModelKey := strings.TrimPrefix(strings.TrimSpace(req.ProviderModelKey), "models/")
	if providerModelKey == "" {
		providerModelKey = modelKey
	}
	capability := normalizeCapability(req.Capability)
	if capability == "" {
		return "", "", "", "", BadAuthRequest("请选择模型能力")
	}
	adapter, ok := registry.Resolve(strings.TrimSpace(req.Protocol))
	if !ok || !adapter.Metadata().Enabled || adapter.Metadata().UnavailableReason != "" {
		return "", "", "", "", BadAuthRequest("请选择有效的模型请求协议")
	}
	protocol := model.ChannelInterfaceType(adapter.Metadata().ID)
	if expected := protocolCapabilityFromMetadata(adapter.Metadata()); expected != "" && expected != capability {
		return "", "", "", "", BadAuthRequest("模型能力与请求协议不匹配")
	}
	if (protocol == model.ChannelInterfaceVolcengineJiMengImage || protocol == model.ChannelInterfaceVolcengineJiMengVideo) && (strings.TrimSpace(channel.APIKey) == "" || strings.TrimSpace(channel.SecretKey) == "") {
		return "", "", "", "", BadAuthRequest("即梦官方协议需要先在渠道中配置 Access Key 和 Secret Key")
	}
	return modelKey, providerModelKey, capability, protocol, nil
}

func (s *Service) DeleteAdminChannelModel(actor *model.User, channelID string, id string) error {
	if err := s.RequireAdmin(actor); err != nil {
		return err
	}
	if _, err := s.repo.AdminSystemChannel(channelID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return BadAuthRequest("系统渠道不存在或已删除")
		}
		return err
	}
	if _, err := s.repo.ChannelModelByID(channelID, id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return BadAuthRequest("渠道模型不存在或已删除")
		}
		return err
	}
	items, err := s.repo.ChannelModels(channelID, false)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(items))
	for _, item := range items {
		if item.ID != id {
			names = append(names, item.ModelKey)
		}
	}
	encoded, err := json.Marshal(names)
	if err != nil {
		return err
	}
	// 删除模型与渠道的兼容模型清单必须同事务提交，避免接口报错但列表已部分变化。
	err = s.repo.DeleteChannelModel(channelID, id, string(encoded), time.Now())
	if errors.Is(err, repository.ErrChannelModelInUse) {
		return BadAuthRequest("渠道模型仍被前台模型供应线路或进行中任务使用，请先移除线路并等待任务结束")
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return BadAuthRequest("渠道模型不存在或已删除")
	}
	if err == nil {
		s.invalidateRouteCatalog()
	}
	return err
}

func (s *Service) syncInitialChannelModels(channel *model.ModelChannel, names []string) error {
	existing, err := s.repo.ChannelModels(channel.ID, true)
	if err != nil {
		return err
	}
	byKey := make(map[string]*model.ChannelModel, len(existing))
	for index := range existing {
		byKey[existing[index].ModelKey] = &existing[index]
	}
	desired := make(map[string]bool, len(names))
	retired := retiredChannelModelKeys(channel.RetiredModelsJSON)
	for _, name := range uniqueNonEmpty(names) {
		name = strings.TrimPrefix(name, "models/")
		if retired[channelModelCatalogKey(name)] {
			continue
		}
		desired[name] = true
		if item := byKey[name]; item != nil {
			if !item.Enabled {
				item.Enabled = true
				item.PriceVersion++
				if err := s.repo.SaveChannelModel(item); err != nil {
					return err
				}
			}
			continue
		}
		modelID, idErr := s.repo.NextPrefixedID("MODEL")
		if idErr != nil {
			return idErr
		}
		item := model.ChannelModel{ID: modelID, ChannelID: channel.ID, ModelKey: name, DisplayName: name, BillingMode: "fixed_request", Enabled: false, PriceVersion: 1}
		if err := s.repo.SaveChannelModel(&item); err != nil {
			return err
		}
	}
	for index := range existing {
		if existing[index].Enabled && !desired[existing[index].ModelKey] {
			existing[index].Enabled = false
			existing[index].PriceVersion++
			if err := s.repo.SaveChannelModel(&existing[index]); err != nil {
				return err
			}
		}
	}
	return nil
}

func retiredChannelModelKeys(raw string) map[string]bool {
	var values []string
	_ = json.Unmarshal([]byte(raw), &values)
	result := make(map[string]bool, len(values))
	for _, value := range values {
		if key := channelModelCatalogKey(value); key != "" {
			result[key] = true
		}
	}
	return result
}

func channelModelCatalogKey(value string) string {
	return strings.ToLower(strings.TrimPrefix(strings.TrimSpace(value), "models/"))
}

func (s *Service) ensureChannelModels(channelID string, includeDisabled bool) ([]model.ChannelModel, error) {
	items, err := s.repo.ChannelModels(channelID, includeDisabled)
	if err != nil || len(items) > 0 {
		return items, err
	}
	channel, err := s.repo.AdminSystemChannel(channelID)
	if err != nil {
		return nil, err
	}
	if err := s.syncInitialChannelModels(channel, channelModelNames(*channel)); err != nil {
		return nil, err
	}
	return s.repo.ChannelModels(channelID, includeDisabled)
}

func (s *Service) syncChannelModelNames(channel *model.ModelChannel) error {
	items, err := s.repo.ChannelModels(channel.ID, false)
	if err != nil {
		return err
	}
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.ModelKey)
	}
	encoded, err := json.Marshal(names)
	if err != nil {
		return err
	}
	channel.ModelsJSON = string(encoded)
	return s.repo.Save(channel)
}

func (s *Service) capabilityForProtocol(protocol model.ChannelInterfaceType) string {
	metadata, ok := s.channelProtocolMetadata(string(protocol))
	if !ok {
		return ""
	}
	return protocolCapabilityFromMetadata(metadata)
}

func protocolCapabilityFromMetadata(metadata protocol.Metadata) string {
	if len(metadata.Categories) == 0 {
		return ""
	}
	return string(metadata.Categories[0])
}
