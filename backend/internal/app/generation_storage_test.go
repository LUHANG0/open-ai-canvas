package app

import (
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"yingce/backend/internal/database"
	"yingce/backend/internal/model"
	"yingce/backend/internal/repository"
)

// PostgreSQL runs explicitly against an isolated DSN; ordinary runs use SQLite.
func newGenerationStorageTestService(t *testing.T) (*Service, *gorm.DB) {
	t.Helper()
	if os.Getenv("GENERATION_STORAGE_TEST_DRIVER") != "postgres" {
		return newMediaRecoveryTestService(t)
	}
	dsn := os.Getenv("CANVAS_TEST_POSTGRES_DSN")
	if dsn == "" {
		t.Fatal("PostgreSQL storage regression requires an isolated test DSN")
	}
	config := &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)}
	admin, err := gorm.Open(postgres.Open(dsn), config)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("generation_storage_%d", time.Now().UnixNano())
	if err := admin.Exec("CREATE SCHEMA " + schema).Error; err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := admin.Exec("DROP SCHEMA " + schema + " CASCADE").Error; err != nil {
			t.Error(err)
		}
		conn, _ := admin.DB()
		_ = conn.Close()
	})
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := gorm.Open(postgres.Open(parsed.String()), config)
	if err != nil {
		t.Fatal(err)
	}
	conn, err := db.DB()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	if err := database.MigrateSchema(db); err != nil {
		t.Fatal(err)
	}
	return &Service{repo: repository.New(db), dataDir: t.TempDir(), activeCancels: make(map[string]context.CancelFunc)}, db
}

func TestGenerationStorageAdmissionChecksBeforeReservation(t *testing.T) {
	for _, tc := range []struct {
		name    string
		prepare func(*testing.T, *gorm.DB, *RuntimePolicySetting, string)
		want    string
	}{
		{"asset count", func(t *testing.T, db *gorm.DB, p *RuntimePolicySetting, user string) {
			p.Resource.AssetCount = 1
			if err := db.Create(&model.Asset{ID: "asset", UserID: user}).Error; err != nil {
				t.Fatal(err)
			}
		}, "账号素材数量"},
		{"structured bytes", func(t *testing.T, db *gorm.DB, p *RuntimePolicySetting, user string) {
			p.Resource.StructuredDataMB = 1
			if err := db.Create(&model.Asset{ID: "asset", UserID: user, PayloadJSON: strings.Repeat("x", int(megabytes(1))+1)}).Error; err != nil {
				t.Fatal(err)
			}
		}, "账号画布和素材数据"},
		{"daily exact headroom", func(t *testing.T, db *gorm.DB, p *RuntimePolicySetting, user string) {
			day := time.Now().UTC().Format("2006-01-02")
			if err := db.Create(&model.UserDailyUploadUsage{ID: "daily", UserID: user, Day: day, Bytes: megabytes(p.Resource.DailyUploadMB - p.Resource.GeneratedFileMB)}).Error; err != nil {
				t.Fatal(err)
			}
		}, "最大生成文件"},
		{"zero stored-file limit cannot bypass asset check", func(t *testing.T, db *gorm.DB, p *RuntimePolicySetting, user string) {
			p.Resource.StoredFileGB = 0
			p.Resource.AssetCount = 1
			if err := db.Create(&model.Asset{ID: "asset", UserID: user}).Error; err != nil {
				t.Fatal(err)
			}
		}, "账号素材数量"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			s, db := newGenerationStorageTestService(t)
			policy := defaultRuntimePolicy()
			tc.prepare(t, db, &policy, "owner")
			err := s.requireStoredFileCapacityForTask("owner", "canvas_image", policy)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("admission error=%v, want %s", err, tc.want)
			}
			if err := s.requireStoredFileCapacityForTask("owner", "text", policy); err != nil {
				t.Fatalf("text blocked by file quota: %v", err)
			}
			if err := s.requireStoredFileCapacityForTask("other", "canvas_video", defaultRuntimePolicy()); err != nil {
				t.Fatalf("quota leaked across accounts: %v", err)
			}
			for _, record := range []any{&model.Task{}, &model.BillingOrder{}, &model.UploadReservation{}} {
				var count int64
				if err := db.Model(record).Count(&count).Error; err != nil || count != 0 {
					t.Fatalf("%T count=%d error=%v", record, count, err)
				}
			}
		})
	}
	t.Run("one byte above maximum headroom", func(t *testing.T) {
		s, db := newGenerationStorageTestService(t)
		policy := defaultRuntimePolicy()
		day := time.Now().UTC().Format("2006-01-02")
		used := megabytes(policy.Resource.DailyUploadMB-policy.Resource.GeneratedFileMB) - 1
		if err := db.Create(&model.UserDailyUploadUsage{ID: "daily", UserID: "owner", Day: day, Bytes: used}).Error; err != nil {
			t.Fatal(err)
		}
		if err := s.requireStoredFileCapacityForTask("owner", "canvas_image", policy); err != nil {
			t.Fatal(err)
		}
		if got, err := s.repo.DailyUploadBytes("owner", day); err != nil || got != used {
			t.Fatalf("admission consumed quota: %d, %v", got, err)
		}
	})
}

func TestGenerationStorageReleasesStagingOnlyAfterCheckpoint(t *testing.T) {
	s, db := newGenerationStorageTestService(t)
	task := seedMediaTask(t, db, providerConfig{})
	name, err := s.stageInlineMedia(mediaTestPNG(t))
	if err != nil {
		t.Fatal(err)
	}
	checkpoint := &mediaCheckpoint{Mode: "image", StartedAt: time.Now(), Items: []mediaCheckpointItem{{TempName: name, MIMEType: "image/png"}}}
	if err := s.saveMediaCheckpoint(task, checkpoint, "local_save"); err != nil {
		t.Fatal(err)
	}
	if err := db.Callback().Update().Before("gorm:update").Register("reject-register", func(tx *gorm.DB) {
		if fields, ok := tx.Statement.Dest.(map[string]any); ok && fields["media_stage"] == "register" {
			tx.AddError(errors.New("injected checkpoint failure"))
		}
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.materializeTaskMedia(context.Background(), task, providerConfig{}, checkpoint); err == nil {
		t.Fatal("checkpoint failure ignored")
	}
	if _, err := os.Stat(s.mediaTempPath(name)); err != nil {
		t.Fatalf("deleted before checkpoint: %v", err)
	}
	if err := db.Callback().Update().Remove("reject-register"); err != nil {
		t.Fatal(err)
	}
	saved, err := s.repo.Task(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.resumeTaskMedia(context.Background(), saved); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(s.mediaTempPath(name)); !os.IsNotExist(err) {
		t.Fatalf("durable resource staging not released: %v", err)
	}
	latest, err := s.repo.Task(task.ID)
	if err != nil {
		t.Fatal(err)
	}
	stored, err := s.decodeMediaCheckpoint(latest)
	if err != nil || stored.Items[0].ResourceID == "" || stored.Items[0].TempName != "" {
		t.Fatalf("bad persisted checkpoint: %+v, %v", stored, err)
	}
	if _, err := s.resumeTaskMedia(context.Background(), latest); err != nil {
		t.Fatalf("ready resource needs no staging or upstream URL: %v", err)
	}
	var count int64
	if err := db.Model(&model.Resource{}).Where("user_id = ?", task.UserID).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("duplicate resources=%d, %v", count, err)
	}
}

func TestGenerationStorageFullStagingIsRetryable(t *testing.T) {
	s, _ := newGenerationStorageTestService(t)
	file, err := s.newMediaTemp(mediaStagingBudget)
	if err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	_, err = s.newMediaTemp(1)
	if err == nil || !retryableMediaRecovery(fmt.Errorf("wrapped: %w", err)) {
		t.Fatalf("full staging is not retryable: %v", err)
	}
	if err := os.Remove(file.Name()); err != nil {
		t.Fatal(err)
	}
	next, err := s.newMediaTemp(1)
	if err != nil {
		t.Fatalf("capacity did not recover: %v", err)
	}
	next.Close()
	if _, err := s.newMediaTemp(mediaStagingBudget + 1); err == nil || retryableMediaRecovery(err) {
		t.Fatalf("oversized reservation must remain terminal: %v", err)
	}
}

func TestGenerationStorageAdmissionRejectsBeforeTaskAndCharge(t *testing.T) {
	s, db := newGenerationStorageTestService(t)
	profile := mustEncodeModelCapabilityConfig(t, DefaultModelCapabilityConfigForModel(string(model.ChannelInterfaceOpenAIImage), "image-test"))
	for _, record := range []any{
		&model.ModelChannel{ID: "channel", Scope: model.ChannelScopeSystem, Enabled: true, Name: "isolated"},
		&model.ChannelModel{ID: "cm", ChannelID: "channel", ModelKey: "image-test", Capability: "image", Protocol: model.ChannelInterfaceOpenAIImage, CapabilityConfigJSON: profile, BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
		&model.ChannelModelPriceTier{ID: "tier", ChannelModelID: "cm", SelectorKey: "{}", SelectorJSON: "{}", BillingMode: "fixed_request", UnitPriceMicrocredits: 100, PriceConfigured: true, Enabled: true},
		&model.CreditAccount{UserID: "owner", AvailableMicrocredits: 10000},
		&model.UserDailyUploadUsage{ID: "daily", UserID: "owner", Day: time.Now().UTC().Format("2006-01-02"), Bytes: megabytes(defaultRuntimePolicy().Resource.DailyUploadMB)},
	} {
		if err := db.Create(record).Error; err != nil {
			t.Fatal(err)
		}
	}
	req := CreateTaskRequest{Type: "canvas_image", Prompt: "synthetic quota check", Model: "image-test", IdempotencyKey: "storage-admission-intent-0001", Input: map[string]any{"mode": "image", "prompt": "synthetic quota check", "config": map[string]any{"channelId": "channel", "model": "image-test", "size": "1024x1024", "quality": "auto", "count": "1"}}}
	if _, err := s.CreateTask("owner", req); err == nil || !strings.Contains(err.Error(), "最大生成文件") {
		t.Fatalf("wrong admission result: %v", err)
	}
	for _, record := range []any{&model.Task{}, &model.BillingOrder{}, &model.TaskSubmission{}} {
		var count int64
		if err := db.Model(record).Count(&count).Error; err != nil || count != 0 {
			t.Fatalf("%T count=%d, %v", record, count, err)
		}
	}
	var balance model.CreditAccount
	if err := db.First(&balance, "user_id = ?", "owner").Error; err != nil || balance.AvailableMicrocredits != 10000 || balance.ReservedMicrocredits != 0 {
		t.Fatalf("charge changed: %+v, %v", balance, err)
	}
}

func TestGenerationStorageProtectsAllPendingReferences(t *testing.T) {
	s, db := newGenerationStorageTestService(t)
	name, err := s.stageInlineMedia(mediaTestPNG(t))
	if err != nil {
		t.Fatal(err)
	}
	checkpoint := &mediaCheckpoint{Mode: "image", StartedAt: time.Now().Add(-30 * 24 * time.Hour), Items: []mediaCheckpointItem{{TempName: name, MIMEType: "image/png"}}}
	task := seedMediaTask(t, db, providerConfig{})
	if err := s.saveMediaCheckpoint(task, checkpoint, "upload"); err != nil {
		t.Fatal(err)
	}
	// Force the protected task after more than one page and the old 1000-row cap.
	if err := db.Delete(task).Error; err != nil {
		t.Fatal(err)
	}
	empty, err := s.encryptSettingSecret(`{"mode":"image","items":[{"resourceId":"already-durable"}]}`)
	if err != nil {
		t.Fatal(err)
	}
	tasks := make([]model.Task, 1002)
	for i := range tasks {
		tasks[i] = model.Task{ID: fmt.Sprintf("pending-%04d", i), UserID: "owner", Status: model.TaskStatusFailed, MediaRecoveryJSON: empty, UpdatedAt: time.Now().Add(-30 * 24 * time.Hour)}
	}
	tasks[len(tasks)-1].MediaRecoveryJSON = task.MediaRecoveryJSON
	if err := db.CreateInBatches(tasks, 100).Error; err != nil {
		t.Fatal(err)
	}
	orphan := filepath.Join(filepath.Dir(s.mediaTempPath(name)), "result-orphan")
	if err := os.WriteFile(orphan, []byte("orphan"), 0600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-26 * time.Hour)
	for _, path := range []string{s.mediaTempPath(name), orphan} {
		if err := os.Chtimes(path, old, old); err != nil {
			t.Fatal(err)
		}
	}
	file, err := s.newMediaTemp(1)
	if err != nil {
		t.Fatal(err)
	}
	file.Close()
	if _, err := os.Stat(s.mediaTempPath(name)); err != nil {
		t.Fatalf("pending inline-only result deleted: %v", err)
	}
	if _, err := os.Stat(orphan); !os.IsNotExist(err) {
		t.Fatalf("unreferenced expired file retained: %v", err)
	}
}

func TestGenerationStorageCleanupFailsClosed(t *testing.T) {
	for _, mode := range []string{"query error", "unreadable checkpoint"} {
		t.Run(mode, func(t *testing.T) {
			s, db := newGenerationStorageTestService(t)
			name, err := s.stageInlineMedia(mediaTestPNG(t))
			if err != nil {
				t.Fatal(err)
			}
			old := time.Now().Add(-26 * time.Hour)
			if err := os.Chtimes(s.mediaTempPath(name), old, old); err != nil {
				t.Fatal(err)
			}
			if mode == "query error" {
				if err := db.Callback().Query().Before("gorm:query").Register("query-failure", func(tx *gorm.DB) {
					if tx.Statement.Table == "tasks" {
						tx.AddError(errors.New("injected reference query failure"))
					}
				}); err != nil {
					t.Fatal(err)
				}
			} else if err := db.Create(&model.Task{ID: "broken", UserID: "owner", Status: model.TaskStatusFailed, MediaRecoveryJSON: "unreadable"}).Error; err != nil {
				t.Fatal(err)
			}
			file, err := s.newMediaTemp(1)
			if err != nil {
				t.Fatal(err)
			}
			file.Close()
			if _, err := os.Stat(s.mediaTempPath(name)); err != nil {
				t.Fatalf("uncertain reference deleted: %v", err)
			}
		})
	}
}
