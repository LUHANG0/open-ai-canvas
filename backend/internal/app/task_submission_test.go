package app

import (
	"errors"
	"sync"
	"testing"
	"yingce/backend/internal/model"
)

func TestTaskSubmissionConcurrentReservationOnce(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	req := creationTextRequest()
	req.IdempotencyKey = "intent-concurrent-0001"
	ids := make(chan string, 8)
	errs := make(chan error, 8)
	var wg sync.WaitGroup
	for range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			task, err := s.CreateTask("user", req)
			if err != nil {
				errs <- err
				return
			}
			ids <- task.ID
		}()
	}
	wg.Wait()
	close(ids)
	close(errs)
	for err := range errs {
		t.Error(err)
	}
	first := ""
	for id := range ids {
		if first == "" {
			first = id
		}
		if id != first {
			t.Errorf("duplicate task %s != %s", id, first)
		}
	}
	for _, record := range []any{&model.Task{}, &model.BillingOrder{}, &model.TaskSubmission{}} {
		var n int64
		if err := db.Model(record).Count(&n).Error; err != nil || n != 1 {
			t.Fatalf("%T count=%d err=%v", record, n, err)
		}
	}
	var account model.CreditAccount
	db.First(&account, "user_id = ?", "user")
	if account.AvailableMicrocredits != 9900 {
		t.Fatalf("balance=%d, want one 100 reservation", account.AvailableMicrocredits)
	}
	// Configuration changes cannot turn a committed intent into a new task.
	db.Model(&model.ModelChannel{}).Where("id = ?", "channel").Update("enabled", false)
	again, err := s.CreateTask("user", req)
	if err != nil || again.ID != first {
		t.Fatalf("replay after config change=%v %v", again, err)
	}
	req.Prompt = "changed payload"
	_, err = s.CreateTask("user", req)
	var appErr *AppError
	if !errors.As(err, &appErr) || appErr.Status != 409 {
		t.Fatalf("changed payload error=%v", err)
	}
}

func TestTaskSubmissionRollbackAndAccountIsolation(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	req := creationTextRequest()
	req.IdempotencyKey = "intent-rollback-0001"
	db.Model(&model.CreditAccount{}).Where("user_id = ?", "user").Update("available_microcredits", 0)
	if _, err := s.CreateTask("user", req); err == nil {
		t.Fatal("insufficient credits accepted")
	}
	var n int64
	db.Model(&model.TaskSubmission{}).Count(&n)
	if n != 0 {
		t.Fatal("failed admission left a receipt")
	}
	db.Model(&model.CreditAccount{}).Where("user_id = ?", "user").Update("available_microcredits", 10000)
	first, err := s.CreateTask("user", req)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.User{ID: "other", Username: "other"}).Error; err != nil {
		t.Fatal(err)
	}
	if err := db.Create(&model.CreditAccount{UserID: "other", AvailableMicrocredits: 10000}).Error; err != nil {
		t.Fatal(err)
	}
	second, err := s.CreateTask("other", req)
	if err != nil || second.ID == first.ID {
		t.Fatalf("cross-user replay: %v %v", second, err)
	}
	// Even if a record is administratively removed, replay must not recharge.
	db.Delete(&model.Task{}, "id = ?", first.ID)
	if _, err := s.CreateTask("user", req); err == nil {
		t.Fatal("deleted task intent executed again")
	}
}

func TestTaskSubmissionRejectsInvalidKeysBeforeAdmission(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	for _, key := range []string{"short", "invalid key with spaces", "abcdefghijklmnop/unsafe"} {
		req := creationTextRequest()
		req.IdempotencyKey = key
		if _, err := s.CreateTask("user", req); err == nil {
			t.Fatalf("accepted %q", key)
		}
	}
	var n int64
	db.Model(&model.Task{}).Count(&n)
	if n != 0 {
		t.Fatal("invalid key created task")
	}
}

func TestWorkbenchSubmissionReturnsOriginalReceipt(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	capability := DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceMiniMaxVideo), "MiniMax-H3")
	capability.Video.Resolutions = []string{"480P"}
	capability.Video.DefaultResolution = "480P"
	profile := mustEncodeModelCapabilityConfig(t, capability)
	for _, record := range []any{
		&model.SystemSetting{Key: featureAvailabilitySettingKey, ValueJSON: `{"videoWorkbenchEnabled":true}`},
		&model.ChannelModel{ID: "video-cm", ChannelID: "channel", ModelKey: "MiniMax-H3", Capability: "video", Protocol: model.ChannelInterfaceMiniMaxVideo, Enabled: true, CapabilityConfigJSON: profile},
		&model.ChannelModelPriceTier{ID: "video-price", ChannelModelID: "video-cm", SelectorKey: "{}", SelectorJSON: "{}", BillingMode: "fixed_request", UnitPriceMicrocredits: 200, PriceConfigured: true, Enabled: true},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	req := WorkbenchTaskInput{IdempotencyKey: "workbench-intent-0001", Kind: "video", Prompt: "same video intent", Model: "MiniMax-H3", ChannelID: "channel", Parameters: map[string]any{"resolution": "480P", "ratio": "16:9", "seconds": 15}}
	first, err := s.CreateWorkbenchTask("user", req, "trace-1", "req-1")
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.CreateWorkbenchTask("user", req, "trace-2", "req-2")
	if err != nil || again.ID != first.ID {
		t.Fatalf("replayed %v err=%v", again, err)
	}
	req.Parameters["seconds"] = 8
	_, err = s.CreateWorkbenchTask("user", req, "trace-3", "req-3")
	var conflict *AppError
	if !errors.As(err, &conflict) || conflict.Status != 409 {
		t.Fatalf("changed intent=%v", err)
	}
	var n int64
	db.Model(&model.BillingOrder{}).Count(&n)
	if n != 1 {
		t.Fatalf("orders=%d", n)
	}
}

func TestTaskSubmissionDoesNotBypassInternalAdmission(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	req := creationTextRequest()
	req.IdempotencyKey = "public-key-on-internal"
	req.admission = &taskAdmission{ID: "internal", NonBillable: true}
	if _, err := s.CreateTask("user", req); err == nil {
		t.Fatal("public intent accepted on Agent admission")
	}
	req.admission = nil
	req.creationPrepare = &creationTaskPreparation{}
	if _, err := s.CreateTask("user", req); err == nil {
		t.Fatal("public intent bypassed creation-runtime receipt")
	}
	var n int64
	db.Model(&model.Task{}).Count(&n)
	if n != 0 {
		t.Fatal("internal rejection created a task")
	}
}

func TestTaskSubmissionCustomChannelKeepsReceiptWithoutManagedCharge(t *testing.T) {
	s, db, _, _ := creationTestService(t)
	req := CreateTaskRequest{IdempotencyKey: "custom-channel-intent-0001", Type: "canvas_text", Prompt: "private channel task", Model: "custom-text", Input: map[string]any{"mode": "text", "prompt": "private channel task", "config": map[string]any{"channelId": "", "baseUrl": "https://example.com/v1", "apiKey": "fixture-secret-key", "interfaceType": "chat-completion", "model": "custom-text"}}}
	req.Input["config"].(map[string]any)["capabilityConfig"] = DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceChatCompletion), "custom-text")
	first, err := s.CreateTask("user", req)
	if err != nil {
		t.Fatal(err)
	}
	again, err := s.CreateTask("user", req)
	if err != nil || again.ID != first.ID {
		t.Fatalf("custom replay=%v %v", again, err)
	}
	var tasks, orders int64
	db.Model(&model.Task{}).Count(&tasks)
	db.Model(&model.BillingOrder{}).Count(&orders)
	if tasks != 1 || orders != 0 {
		t.Fatalf("custom tasks=%d managed orders=%d", tasks, orders)
	}
}
