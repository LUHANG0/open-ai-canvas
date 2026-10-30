package hostupdate

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
)

type recoveryHealthTransport struct{ body string }

func (tr recoveryHealthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(tr.body)), Request: req}, nil
}

func TestHealthRequiresReadySchemaAndDependencies(t *testing.T) {
	valid := `{"code":0,"data":{"ready":true,"started":true,"draining":false,"build":{"version":"v1.2.0"},"schema":{"current":61,"expected":61,"ready":true},"checks":{"database":true,"runtime":true,"schema":true}}}`
	for _, scenario := range []string{"healthy", "not-ready", "not-started", "draining", "database", "runtime", "schema-check", "schema-ready", "schema-version", "missing-version", "wrong-version", "missing-readiness"} {
		t.Run(scenario, func(t *testing.T) {
			var payload map[string]any
			if err := json.Unmarshal([]byte(valid), &payload); err != nil {
				t.Fatal(err)
			}
			data := payload["data"].(map[string]any)
			switch scenario {
			case "not-ready":
				data["ready"] = false
			case "not-started":
				data["started"] = false
			case "draining":
				data["draining"] = true
			case "database", "runtime":
				data["checks"].(map[string]any)[scenario] = false
			case "schema-check":
				data["checks"].(map[string]any)["schema"] = false
			case "schema-ready":
				data["schema"].(map[string]any)["ready"] = false
			case "schema-version":
				data["schema"].(map[string]any)["current"] = 60
			case "missing-version":
				delete(data["build"].(map[string]any), "version")
			case "wrong-version":
				data["build"].(map[string]any)["version"] = "v1.1.0"
			case "missing-readiness":
				delete(data, "ready")
			}
			body, _ := json.Marshal(payload)
			manager := &Manager{httpClient: &http.Client{Transport: recoveryHealthTransport{string(body)}}}
			err := manager.checkHealthOnce("http://fixture.invalid/api/health/ready", "v1.2.0")
			if (err == nil) != (scenario == "healthy") {
				t.Fatalf("health accepted=%v for %s, error=%v", err == nil, scenario, err)
			}
		})
	}
}

type recoveryFailureRunner struct {
	calls []string
	fail  string
}

func (r *recoveryFailureRunner) Run(_ context.Context, _ string, args, _ []string, stdout, _ io.Writer) error {
	call := strings.Join(args, " ")
	r.calls = append(r.calls, call)
	if strings.Contains(call, " stop ") && r.fail == "stop" {
		return errors.New("fixture stop failed")
	}
	if strings.Contains(call, "dropdb") && r.fail == "database" {
		return errors.New("fixture database restore failed")
	}
	return nil
}

func TestRollbackStopsOnFailedPrerequisites(t *testing.T) {
	for _, scenario := range []string{"stop", "missing-compose", "missing-env", "corrupt-backup", "database", "compose-restore", "env-restore", "backup-version", "env-version"} {
		t.Run(scenario, func(t *testing.T) {
			manager, _ := lifecycleManager(t, "")
			backup, err := manager.createBackup("v1.1.0")
			if err != nil {
				t.Fatal(err)
			}
			if err := manager.savePreviousDeployment(); err != nil {
				t.Fatal(err)
			}
			switch scenario {
			case "missing-compose":
				if err := os.Remove(manager.previousComposePath()); err != nil {
					t.Fatal(err)
				}
			case "missing-env":
				if err := os.Remove(manager.previousEnvPath()); err != nil {
					t.Fatal(err)
				}
			case "compose-restore", "env-restore":
				path := manager.composePath()
				if scenario == "env-restore" {
					path = manager.envPath()
				}
				if err := os.Remove(path); err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(path, 0700); err != nil {
					t.Fatal(err)
				}
			case "backup-version":
				backup.Version = "v0.9.0"
			case "env-version":
				if err := setEnvValue(manager.previousEnvPath(), "CANVAS_IMAGE_TAG", "0.9.0"); err != nil {
					t.Fatal(err)
				}
			case "corrupt-backup":
				if err := os.WriteFile(backup.Path, []byte("corrupt"), 0600); err != nil {
					t.Fatal(err)
				}
			}
			runner := &recoveryFailureRunner{fail: scenario}
			manager.runner = runner
			manager.runRollback("v1.1.0", backup, true)
			if manager.state.Operation.Phase != PhaseManualIntervention {
				t.Fatalf("phase=%s", manager.state.Operation.Phase)
			}
			for _, call := range runner.calls {
				if strings.Contains(call, " up ") {
					t.Errorf("must not start services after failed recovery prerequisite: %s", call)
				}
				if scenario != "database" && (strings.Contains(call, "dropdb") || strings.Contains(call, "createdb") || strings.Contains(call, "pg_restore")) {
					t.Errorf("must not change database: %s", call)
				}
				if strings.Contains(call, " stop ") && !strings.Contains(call, "stop web backend yingce-agent") {
					t.Errorf("all writers must stop: %s", call)
				}
			}
		})
	}
}
