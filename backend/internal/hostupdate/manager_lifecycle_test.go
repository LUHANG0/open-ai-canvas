package hostupdate

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// The runner simulates writes made while images download and during shutdown.
// The real Manager still creates, commits and verifies its ZIP and saved config.
type updateLifecycleRunner struct {
	calls    []string
	fail     string
	version  string
	database string
	data     string
	stopped  bool
}

func (r *updateLifecycleRunner) Run(_ context.Context, _ string, args, environment []string, stdout, _ io.Writer) error {
	call := strings.Join(args, " ")
	r.calls = append(r.calls, call)
	if len(args) > 2 && args[0] == "image" {
		if r.fail == "inspect" {
			return errors.New("fixture digest failure")
		}
		return json.NewEncoder(stdout).Encode([]string{strings.Split(args[2], ":")[0] + "@sha256:" + strings.Repeat("a", 64)})
	}
	switch {
	case strings.Contains(call, " pull "):
		r.database = "write-during-image-download"
		if r.fail == "pull" {
			return errors.New("fixture pull failure")
		}
	case strings.Contains(call, " stop "):
		r.database, r.data, r.stopped = "last-database-write", "last-file-write", true
		if r.fail == "stop" {
			return errors.New("fixture partial shutdown failure")
		}
	case strings.Contains(call, " start "):
		if r.fail == "restart" {
			return errors.New("fixture restart failure")
		}
		r.stopped = false
	case strings.Contains(call, "pg_dump"):
		if r.fail == "dump" || r.fail == "restart" {
			return errors.New("fixture dump failure")
		}
		_, err := io.WriteString(stdout, r.database)
		return err
	case strings.Contains(call, "tar") && strings.Contains(call, "/data"):
		if r.fail == "tar" {
			return errors.New("fixture archive failure")
		}
		_, err := io.WriteString(stdout, r.data)
		return err
	case strings.Contains(call, " up "):
		for _, value := range environment {
			if strings.HasPrefix(value, "CANVAS_IMAGE_TAG=") {
				r.version = "v" + strings.TrimPrefix(value, "CANVAS_IMAGE_TAG=")
			}
		}
		r.stopped = false
	}
	return nil
}

type lifecycleTransport struct{ runner *updateLifecycleRunner }

func (tr lifecycleTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	body := "services: {}\n# target release\n"
	if req.URL.Host == "fixture.invalid" {
		if tr.runner.stopped {
			return nil, errors.New("fixture service is stopped")
		}
		body = fmt.Sprintf(`{"code":0,"data":{"ready":true,"started":true,"build":{"version":%q},"schema":{"current":61,"expected":61,"ready":true},"checks":{"database":true,"runtime":true,"schema":true}}}`, tr.runner.version)
	}
	return &http.Response{StatusCode: http.StatusOK, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body)), Request: req}, nil
}

func lifecycleManager(t *testing.T, failure string) (*Manager, *updateLifecycleRunner) {
	t.Helper()
	root := t.TempDir()
	manager, err := NewManager(Config{Repository: "fixture/repository", InstallDir: root, StateDir: filepath.Join(root, "state"), HealthURL: "http://fixture.invalid/api/health/ready", StableWindow: time.Nanosecond, StepTimeout: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	for path, content := range map[string]string{manager.composePath(): "services: {}\n", manager.envPath(): "CANVAS_IMAGE_TAG=1.1.0\nPOSTGRES_USER=fixture\nPOSTGRES_DB=fixture\nYINGCE_AGENT_TOKEN=fixture-only-not-production-token\n"} {
		if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	runner := &updateLifecycleRunner{fail: failure, version: "v1.1.0", database: "before-download", data: "before-shutdown"}
	manager.runner, manager.httpClient = runner, &http.Client{Transport: lifecycleTransport{runner}}
	return manager, runner
}

func TestUpdateBackupIncludesShutdownWrites(t *testing.T) {
	manager, runner := lifecycleManager(t, "")
	manager.runUpdate("v1.1.0", "v1.2.0")
	if manager.state.Operation.Phase != PhaseSucceeded || manager.state.LastBackup == nil {
		t.Fatalf("update state: %+v", manager.state)
	}
	previousCompose, err := os.ReadFile(manager.previousComposePath())
	if err != nil || string(previousCompose) != "services: {}\n" {
		t.Fatalf("previous Compose did not preserve the old deployment: %q, %v", previousCompose, err)
	}
	previousEnv, err := readEnvFile(manager.previousEnvPath())
	if err != nil || previousEnv["CANVAS_IMAGE_TAG"] != "1.1.0" {
		t.Fatalf("previous environment did not preserve the old release: %v, %v", previousEnv, err)
	}
	archive, err := zip.OpenReader(manager.state.LastBackup.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	for name, want := range map[string]string{"database.dump": "last-database-write", "backend-data.tar": "last-file-write"} {
		file, err := archive.Open(name)
		if err != nil {
			t.Fatal(err)
		}
		data, err := io.ReadAll(file)
		file.Close()
		if err != nil || string(data) != want {
			t.Errorf("%s = %q, want shutdown snapshot %q (err %v)", name, data, want, err)
		}
	}
	index := func(part string) int {
		return slices.IndexFunc(runner.calls, func(call string) bool { return strings.Contains(call, part) })
	}
	if pull, stop, dump, migrate := index(" pull "), index(" stop web backend yingce-agent"), index("pg_dump"), index("run --rm migrate"); !(pull >= 0 && stop > pull && dump > stop && migrate > dump) {
		t.Fatalf("download, drain all writers, backup and migrate out of order: %v", runner.calls)
	}
}

func TestUpdateBeforeMigrationFailuresPreserveLiveData(t *testing.T) {
	for _, failure := range []string{"pull", "inspect", "stop", "dump", "tar", "previous-compose", "previous-env", "restart"} {
		t.Run(failure, func(t *testing.T) {
			manager, runner := lifecycleManager(t, failure)
			previous := &Backup{ID: "earlier-verified-backup", Version: "v1.0.0"}
			manager.state.LastBackup, manager.state.RollbackVersion = previous, previous.Version
			if failure == "previous-env" {
				if err := os.WriteFile(manager.previousComposePath(), []byte("earlier-rollback-compose\n"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if failure == "previous-compose" || failure == "previous-env" {
				path := manager.previousComposePath()
				if failure == "previous-env" {
					path = manager.previousEnvPath()
				}
				if err := os.Mkdir(path, 0o700); err != nil {
					t.Fatal(err)
				}
			}
			manager.runUpdate("v1.1.0", "v1.2.0")
			want := PhaseFailed
			if failure == "restart" {
				want = PhaseManualIntervention
			}
			if manager.state.Operation.Phase != want || manager.state.Operation.AutomaticRollback || manager.state.Operation.Error == "" {
				t.Errorf("failure state = %+v, want %s without database rollback", manager.state.Operation, want)
			}
			if manager.state.LastBackup != previous || manager.state.RollbackVersion != previous.Version {
				t.Error("failed preparation replaced the previously verified rollback point")
			}
			if failure == "previous-env" {
				data, err := os.ReadFile(manager.previousComposePath())
				if err != nil || string(data) != "earlier-rollback-compose\n" {
					t.Errorf("failed environment save mixed a new Compose with the earlier backup: %q, %v", data, err)
				}
			}
			for _, call := range runner.calls {
				for _, forbidden := range []string{"dropdb", "createdb", "pg_restore", "run --rm migrate", " up "} {
					if strings.Contains(call, forbidden) {
						t.Errorf("failure before migration must not restore or replace live data: %s", call)
					}
				}
			}
			wasStopped := failure != "pull" && failure != "inspect"
			restarted := slices.ContainsFunc(runner.calls, func(call string) bool { return strings.Contains(call, " start backend yingce-agent web") })
			if restarted != wasStopped || runner.stopped != (failure == "restart") {
				t.Errorf("old services recovery: restarted=%v stopped=%v calls=%v", restarted, runner.stopped, runner.calls)
			}
			partials, err := filepath.Glob(filepath.Join(manager.config.BackupDir, "*.partial"))
			if err != nil || len(partials) != 0 {
				t.Errorf("incomplete backup left behind: %v, %v", partials, err)
			}
			staging, err := filepath.Glob(filepath.Join(manager.config.StateDir, ".rollback-config-*"))
			if err != nil || len(staging) != 0 {
				t.Errorf("temporary deployment configuration left behind: %v, %v", staging, err)
			}
		})
	}
}

func TestPreviousDeploymentPairRecoversFromSecondWriteFailure(t *testing.T) {
	for _, scenario := range []string{"existing-point", "no-earlier-compose", "restore-fails"} {
		t.Run(scenario, func(t *testing.T) {
			manager, _ := lifecycleManager(t, "")
			previous := &Backup{ID: "earlier-point", Version: "v1.0.0"}
			manager.state.LastBackup, manager.state.RollbackVersion = previous, previous.Version
			if scenario != "no-earlier-compose" {
				if err := os.WriteFile(manager.previousComposePath(), []byte("earlier-compose"), 0o600); err != nil {
					t.Fatal(err)
				}
			}
			if err := os.WriteFile(manager.previousEnvPath(), []byte("earlier-env"), 0o600); err != nil {
				t.Fatal(err)
			}
			composeWrites := 0
			err := manager.replacePreviousDeployment(func(source, target string, mode os.FileMode) error {
				if target == manager.previousEnvPath() {
					return errors.New("fixture environment commit failure")
				}
				if target == manager.previousComposePath() {
					composeWrites++
					if scenario == "restore-fails" && composeWrites == 2 {
						return errors.New("fixture earlier Compose restoration failure")
					}
				}
				return replaceFile(source, target, mode)
			})
			if err == nil {
				t.Fatal("failed environment commit was accepted")
			}
			data, readErr := os.ReadFile(manager.previousComposePath())
			if scenario == "no-earlier-compose" {
				if !os.IsNotExist(readErr) {
					t.Fatalf("new Compose remained beside the old environment: %q, %v", data, readErr)
				}
			} else if scenario == "existing-point" && (readErr != nil || string(data) != "earlier-compose") {
				t.Fatalf("earlier Compose was not restored: %q, %v", data, readErr)
			}
			data, readErr = os.ReadFile(manager.previousEnvPath())
			if readErr != nil || string(data) != "earlier-env" {
				t.Fatalf("failed replacement changed the earlier environment: %q, %v", data, readErr)
			}
			if scenario == "restore-fails" {
				if manager.state.LastBackup != nil || manager.state.RollbackVersion != "" || !strings.Contains(err.Error(), "已禁用人工回退") {
					t.Fatalf("unsafe manual rollback remained available: %+v, %v", manager.state, err)
				}
			} else if manager.state.LastBackup != previous || manager.state.RollbackVersion != previous.Version {
				t.Fatal("a recovered config pair lost the earlier rollback record")
			}
			staging, globErr := filepath.Glob(filepath.Join(manager.config.StateDir, ".rollback-config-*"))
			if globErr != nil || len(staging) != 0 {
				t.Fatalf("sensitive config staging files left behind: %v, %v", staging, globErr)
			}
		})
	}
}
