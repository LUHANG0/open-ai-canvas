package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os/exec"
	"strings"
	"sync"
	"testing"
	"time"

	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

func TestCloudAgentPiMixedBatchFlushesImages(t *testing.T) {
	for _, failed := range []bool{false, true} {
		name := "success"
		if failed {
			name = "failed_final_tool"
		}
		t.Run(name, func(t *testing.T) {
			state := cloudAgentPairingState(
				cloudAgentPairingCall("image", "canvas_inspect_image", "{}"),
				cloudAgentPairingCall("state", "canvas_get_state", "{}"),
			)
			cloudAgentToolResult("run", state, state.Calls[0], cloudAgentPairingInspection("image-a", "https://example.test/a"), nil)
			if len(state.PendingImageInspections) != 1 || len(cloudAgentImageMessageIndexes(state.Canonical.Messages)) != 0 {
				t.Fatal("image must remain buffered until all tool results arrive")
			}
			var toolErr error
			if failed {
				toolErr = errors.New("read failed")
			}
			cloudAgentToolResult("run", state, state.Calls[1], map[string]any{"ok": true}, toolErr)
			// Pi does not call advanceCloudAgent's fallback flush.
			assertPiBatchImages(t, state, 1)
			if cloudAgentFlushPendingImages(state) {
				t.Fatal("batch completion must not leave a duplicate image to flush")
			}
		})
	}
}

// 真实 Node/Pi 循环和任务 Worker 贯通；模型服务用本地 HTTP 替身，核对实际收到的像素。
func TestCloudAgentPiRuntimeMixedBatchDeliversImages(t *testing.T) {
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("node is not installed")
	}
	if _, err := agentRuntimeDirForTest(); err != nil {
		t.Skip(err.Error())
	}
	t.Setenv("CANVAS_ALLOWED_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1")
	t.Setenv("REDIS_URL", "")
	var mu sync.Mutex
	var requests []map[string]any
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		mu.Lock()
		requests = append(requests, body)
		first := len(requests) == 1
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if first {
			_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"","tool_calls":[{"id":"inspect-cat","type":"function","function":{"name":"canvas_inspect_image","arguments":"{\"nodeId\":\"cat\"}"}},{"id":"inspect-hero","type":"function","function":{"name":"canvas_inspect_image","arguments":"{\"nodeId\":\"hero\"}"}},{"id":"read-state","type":"function","function":{"name":"canvas_get_state","arguments":"{}"}}]}}]}`))
			return
		}
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"mock accepted both images"}}]}`))
	}))
	defer upstream.Close()
	s, db, pixels := cloudAgentVisionFixture(t)
	s = New(s.repo, s.dataDir)
	t.Cleanup(func() { _ = s.Close() })
	if err := db.Model(&model.ModelChannel{}).Where("id = ?", "channel").Updates(map[string]any{"base_url": upstream.URL, "api_key": "test-only"}).Error; err != nil {
		t.Fatal(err)
	}
	stop := make(chan struct{})
	defer close(stop)
	go func() {
		for {
			select {
			case <-stop:
				return
			default:
			}
			_ = s.ProcessNextTask()
			time.Sleep(20 * time.Millisecond)
		}
	}()
	req := agentTestRequest()
	req.VisionEnabled = true
	run, err := s.CreateCloudAgentRun("user", req, "")
	if err != nil {
		t.Fatal(err)
	}
	execution := waitLiveAgentTerminal(t, s, run.ID)
	if execution.Status != "completed" {
		t.Fatalf("run status=%s failure=%q", execution.Status, execution.FailureMessage)
	}
	mu.Lock()
	bodies := append([]map[string]any(nil), requests...)
	mu.Unlock()
	if len(bodies) != 2 {
		t.Fatalf("expected 2 model calls, got %d", len(bodies))
	}
	var messages []map[string]any
	for _, value := range bodies[1]["messages"].([]any) {
		messages = append(messages, value.(map[string]any))
	}
	assertCloudAgentToolCallPairing(t, messages)
	indexes := cloudAgentImageMessageIndexes(messages)
	if len(indexes) != 1 || cloudAgentMessageImagePartCount(messages[indexes[0]]) != 2 {
		t.Fatalf("next model call lost the mixed batch images: %s", cloudAgentDebugMessages(messages))
	}
	encoded, _ := json.Marshal(messages)
	if strings.Count(string(encoded), "data:image/png;base64,"+base64.StdEncoding.EncodeToString(pixels)) != 2 {
		t.Fatal("model did not receive both exact stored images")
	}
	state, err := cloudAgentDecode(execution)
	if err != nil {
		t.Fatal(err)
	}
	persisted, _ := json.Marshal(state.Canonical.Messages)
	if strings.Contains(string(persisted), "base64,") || strings.Contains(string(persisted), "signature=") {
		t.Fatal("pixel bytes or signed URL leaked into durable conversation")
	}
}

func assertPiBatchImages(t *testing.T, state *cloudAgentRuntime, count int) {
	t.Helper()
	if len(state.PendingImageInspections) != 0 {
		t.Fatalf("Pi batch left %d images pending", len(state.PendingImageInspections))
	}
	assertCloudAgentToolCallPairing(t, state.Canonical.Messages)
	indexes := cloudAgentImageMessageIndexes(state.Canonical.Messages)
	if len(indexes) != 1 || indexes[0] != len(state.Canonical.Messages)-1 {
		t.Fatalf("expected one trailing image message: %s", cloudAgentDebugMessages(state.Canonical.Messages))
	}
	if got := cloudAgentMessageImagePartCount(state.Canonical.Messages[indexes[0]]); got != count {
		t.Fatalf("image count=%d, want %d", got, count)
	}
}

func TestCloudAgentPiToolBridgeFlushesMixedBatch(t *testing.T) {
	s, db, _ := agentMediaFixture(t)
	capability := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "text-test")
	capability.Text.References.MaxImages = 2
	if err := db.Model(&model.ChannelModel{}).Where("id = ?", "cm").Update("capability_config_json", mustEncodeModelCapabilityConfig(t, capability)).Error; err != nil {
		t.Fatal(err)
	}
	root, err := s.CreateCloudAgentRun("user", agentTestRequest(), "")
	if err != nil {
		t.Fatal(err)
	}
	run, err := s.repo.CloudAgent("user", root.ID)
	if err != nil {
		t.Fatal(err)
	}
	state, err := cloudAgentDecode(run)
	if err != nil {
		t.Fatal(err)
	}
	state.ActiveTaskID = ""
	state.Request.VisionEnabled = true
	state.Calls = []cloudAgentCall{
		cloudAgentStoryboardCall(t, "canvas_inspect_image", "inspect-cat", map[string]any{"nodeId": "cat"}),
		cloudAgentStoryboardCall(t, "canvas_inspect_image", "inspect-hero", map[string]any{"nodeId": "hero"}),
		cloudAgentStoryboardCall(t, "canvas_get_state", "read-state", map[string]any{}),
	}
	state.Canonical.Messages = append(state.Canonical.Messages, map[string]any{"role": "assistant", "content": "", "tool_calls": state.Calls})
	if err := s.repo.MutateCloudAgent("user", run.ID, run.Revision, func(current *model.CloudAgentExecution, _ *repository.Repository) error {
		return cloudAgentSave(current, &state)
	}); err != nil {
		t.Fatal(err)
	}
	for index, call := range state.Calls {
		if _, err := s.executeCloudAgentRuntimeTool(context.Background(), "user", run.ID, call); err != nil {
			t.Fatal(err)
		}
		stored, err := s.repo.CloudAgent("user", run.ID)
		if err != nil {
			t.Fatal(err)
		}
		saved, err := cloudAgentDecode(stored)
		if err != nil {
			t.Fatal(err)
		}
		if index < len(state.Calls)-1 {
			if len(cloudAgentImageMessageIndexes(saved.Canonical.Messages)) != 0 {
				t.Fatal("images interleaved with tool results")
			}
			continue
		}
		assertPiBatchImages(t, &saved, 2)
		// 桥接响应丢失后的同 callId 重试只回放回执，不重复追加图片或写入检查点。
		if _, err := s.executeCloudAgentRuntimeTool(context.Background(), "user", run.ID, call); err != nil {
			t.Fatal(err)
		}
		replayed, err := s.repo.CloudAgent("user", run.ID)
		if err != nil {
			t.Fatal(err)
		}
		if replayed.Revision != stored.Revision {
			t.Fatal("replaying a committed tool result changed the checkpoint")
		}
		// The shorter Pi projection carries text receipts; the model bridge must
		// retain the server's trailing image message.
		parts := make([]any, 0, len(state.Calls))
		for _, item := range state.Calls {
			parts = append(parts, map[string]any{"type": "toolCall", "id": item.ID, "name": item.Function.Name, "arguments": map[string]any{}})
		}
		projected := []map[string]any{{"role": "assistant", "content": parts}}
		for _, item := range state.Calls {
			content, ok := cloudAgentToolMessage(&saved, item.ID)
			if !ok {
				t.Fatalf("missing tool receipt %s", item.ID)
			}
			projected = append(projected, map[string]any{"role": "toolResult", "toolCallId": item.ID, "content": content})
		}
		canonical, err := cloudAgentPiCanonicalForModelRequest(projected, saved.Canonical)
		if err != nil {
			t.Fatal(err)
		}
		// 保留梦层的账号资源白名单合同：补送的两张图必须获准进入下一次模型请求。
		references, err := s.cloudAgentPiStepImageReferences("user", saved.Request, &canonical)
		if err != nil {
			t.Fatal(err)
		}
		if len(references) != 2 {
			t.Fatalf("model request lost inspected resources: %+v", references)
		}
		input := canvasGenerationInput{Mode: "text", ReferenceImages: references, AgentRequests: &agentToolRequests{Canonical: &canonical}}
		if err := validateAgentResourcePlaceholders(input); err != nil {
			t.Fatalf("flushed images failed resource preflight: %v", err)
		}
		saved.Canonical = canonical
		assertPiBatchImages(t, &saved, 2)
	}
}
