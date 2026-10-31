package hostupdate

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type customFixtureRunner struct {
	manager           *Manager
	live              CustomRelease
	calls             []string
	fail              string
	stopped           bool
	base              map[string]any
	migrationOwned    bool
	migrationExternal bool
}

func (r *customFixtureRunner) Run(ctx context.Context, name string, args, environment []string, stdout, stderr io.Writer) error {
	call := name + " " + strings.Join(args, " ")
	r.calls = append(r.calls, call)
	if name == r.manager.custom.WebPublisher {
		if r.fail == args[0] {
			_, _ = io.WriteString(stderr, "credential-should-not-leak")
			return errors.New("fixture publisher failure")
		}
		if r.fail == "config-drift" && args[0] == "preflight" {
			return os.WriteFile(r.manager.envPath(), []byte("changed\n"), 0600)
		}
		return nil
	}
	if args[0] == "context" {
		return json.NewEncoder(stdout).Encode("unix:///var/run/docker.sock")
	}
	if args[0] == "ps" {
		if r.fail == "migration-query" {
			return errors.New("fixture Docker unavailable")
		}
		ownedOnly := strings.Contains(call, "label=io.mengceng.host-updater")
		if r.migrationOwned {
			_, _ = io.WriteString(stdout, "fixture-owned\n")
		}
		if !ownedOnly && (r.migrationExternal || r.fail == "migration-active") {
			_, _ = io.WriteString(stdout, "fixture-external\n")
		}
		return nil
	}
	if args[0] == "stop" {
		if deadline, ok := ctx.Deadline(); !ok || time.Until(deadline) <= 60*time.Second {
			return errors.New("migration stop command needs time beyond Docker's 60-second grace period")
		}
		if r.fail == "migration-stop" {
			return errors.New("fixture stop failed")
		}
		if args[len(args)-1] != "fixture-owned" {
			return errors.New("attempted to stop unrelated migration")
		}
		r.migrationOwned = false
		return nil
	}
	if args[0] == "image" {
		_, err := io.WriteString(stdout, args[2])
		return err
	}
	if args[0] == "inspect" {
		service := strings.TrimPrefix(args[1], "container-")
		project := r.manager.projectName()
		if r.fail == "project" {
			project = "foreign-project"
		}
		env := []string{}
		for key, value := range r.base["services"].(map[string]any)[service].(map[string]any)["environment"].(map[string]string) {
			env = append(env, key+"="+value)
		}
		if r.fail == "environment" {
			env = nil
		}
		return json.NewEncoder(stdout).Encode([]any{map[string]any{"Image": r.live.Components[service].Image, "Config": map[string]any{"Labels": map[string]string{"com.docker.compose.project": project, "com.docker.compose.service": service}, "Env": env}, "Mounts": []any{}, "State": map[string]any{"Running": !r.stopped, "Health": map[string]string{"Status": "healthy"}}}})
	}
	composePath := ""
	for i, arg := range args {
		if arg == "-f" {
			composePath = args[i+1]
		}
	}
	if strings.HasSuffix(call, "config --format json") {
		if data, err := os.ReadFile(composePath); err == nil && bytes.HasPrefix(data, []byte("{")) {
			// config serializes runtime dollar signs as $$ on every export.
			_, err = stdout.Write(data)
			return err
		}
		body, err := json.Marshal(r.base)
		if err != nil {
			return err
		}
		_, err = stdout.Write(bytes.ReplaceAll(body, []byte("$"), []byte("$$")))
		return err
	}
	if strings.Contains(call, " ps ") {
		_, err := io.WriteString(stdout, "container-"+args[len(args)-1])
		return err
	}
	if strings.Contains(call, " stop ") {
		r.stopped = true
	}
	if strings.Contains(call, " start ") {
		r.stopped = false
	}
	if strings.Contains(call, " up ") {
		if r.fail == "startup" && !strings.Contains(composePath, "from-compose") {
			var config struct {
				Services map[string]struct{ Image string }
			}
			data, _ := os.ReadFile(composePath)
			_ = json.Unmarshal(data, &config)
			if config.Services["web"].Image != fixtureCustomRelease("old").Components["web"].Image {
				return errors.New("fixture startup failure")
			}
		}
		var config struct {
			Services map[string]struct{ Image string }
		}
		data, _ := os.ReadFile(composePath)
		_ = json.Unmarshal(data, &config)
		for _, service := range customServices {
			c := r.live.Components[service]
			c.Image = config.Services[service].Image
			r.live.Components[service] = c
		}
		r.stopped = false
	}
	return nil
}

type customFixtureTransport struct{ runner *customFixtureRunner }

func (tr customFixtureTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	c := tr.runner.live.Components["backend"]
	if tr.runner.fail == "commit" {
		c.Commit = strings.Repeat("f", 40)
	}
	body := `{"code":0,"data":{"ready":true,"started":true,"build":{"version":"` + c.Version + `","commit":"` + c.Commit + `"},"schema":{"current":61,"expected":61,"ready":true},"checks":{"database":true,"runtime":true,"schema":true}}}`
	return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header), Request: req}, nil
}

func customLifecycleManager(t *testing.T, failure string) (*Manager, *customFixtureRunner, CustomRelease) {
	t.Helper()
	m, p := customTestManager(t)
	from := fixtureCustomRelease("old")
	to := fixtureCustomRelease("new")
	to.BasedOn = "old"
	c := to.Components["web"]
	c.Image = "sha256:" + strings.Repeat("e", 64)
	to.Components["web"] = c
	writeCustomJSON(t, p.TargetRelease, to)
	hook := filepath.Join(p.ProjectDirectory, "publisher")
	if err := os.WriteFile(hook, []byte("fixture-publisher"), 0700); err != nil {
		t.Fatal(err)
	}
	p.WebPublisher = hook
	p.WebPublisherSHA256, _ = fileCustomHash(hook)
	writeCustomJSON(t, m.config.CustomProfile, p)
	m.custom = &p
	m.config.StableWindow = time.Nanosecond
	m.config.HealthTimeout = 3 * time.Second
	services := map[string]any{}
	for _, service := range append(append([]string{}, customServices...), "postgres", "redis", "migrate") {
		services[service] = map[string]any{"image": "stale:mutable", "build": map[string]any{"context": "/not-a-build-input"}, "environment": map[string]string{"FIXTURE_PASSWORD": "a$quoted${secret}"}, "volumes": []any{}}
	}
	databaseURL := "postgresql://fixture:password@postgres:5432/fixture?sslmode=disable"
	services["backend"].(map[string]any)["environment"] = map[string]string{"CANVAS_DATABASE_DRIVER": "postgres", "CANVAS_AUTO_MIGRATE": "false", "CANVAS_BACKEND_DATA_DIR": "/data", "DATABASE_URL": databaseURL, "FIXTURE_PASSWORD": "a$quoted${secret}"}
	services["migrate"].(map[string]any)["environment"] = map[string]string{"CANVAS_DATABASE_DRIVER": "postgres", "DATABASE_URL": databaseURL}
	services["postgres"].(map[string]any)["environment"] = map[string]string{"POSTGRES_USER": "fixture", "POSTGRES_DB": "fixture", "POSTGRES_PASSWORD": "password"}
	r := &customFixtureRunner{manager: m, live: from, fail: failure, base: map[string]any{"name": p.ProjectName, "services": services}}
	m.runner = r
	m.httpClient = &http.Client{Transport: customFixtureTransport{r}}
	return m, r, to
}

func TestCustomRenderedComposePreservesStackAndCredentials(t *testing.T) {
	m, r, to := customLifecycleManager(t, "")
	path := filepath.Join(m.config.StateDir, "rendered.json")
	if err := m.renderCustomCompose(to, path); err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Contains(body, []byte("a$$quoted$${secret}")) || bytes.Contains(body, []byte("\"build\"")) {
		t.Fatalf("interpolation or build contract failed: %s", body)
	}
	var config struct {
		Services map[string]struct{ Image string }
	}
	if err := json.Unmarshal(body, &config); err != nil {
		t.Fatal(err)
	}
	if config.Services["migrate"].Image != to.Components["backend"].Image {
		t.Fatal("migration kept stale image")
	}
	call := r.calls[len(r.calls)-1]
	for _, path := range m.custom.ComposeFiles {
		if !strings.Contains(call, "-f "+path) {
			t.Fatal("lost Compose overlay")
		}
	}
	if !strings.Contains(call, "--project-name mengceng-fixture --project-directory "+m.custom.ProjectDirectory) {
		t.Fatal("lost original project identity")
	}
}

func TestCustomMigrationWritersMustStopBeforeRecovery(t *testing.T) {
	for _, failure := range []string{"", "external", "migration-query", "migration-stop"} {
		t.Run(failure, func(t *testing.T) {
			m, r, _ := customLifecycleManager(t, failure)
			r.migrationOwned = true
			r.migrationExternal = failure == "external"
			err := m.stopCustomMigrations()
			if (err != nil) != (failure != "") {
				t.Fatalf("stop error=%v failure=%s", err, failure)
			}
			joined := strings.Join(r.calls, "\n")
			if !strings.Contains(joined, "label=com.docker.compose.project=mengceng-fixture") || !strings.Contains(joined, "label=com.docker.compose.service=migrate") {
				t.Fatal("migration discovery escaped project or service scope")
			}
			if strings.Contains(joined, "stop --time 60 fixture-external") {
				t.Fatal("stopped an external migration")
			}
			if (failure == "" || failure == "external") && r.migrationOwned {
				t.Fatal("owned migration still running")
			}
			if failure == "external" && !r.migrationExternal {
				t.Fatal("external migration was changed")
			}
		})
	}
}

func TestCustomRecoveryFailureStillStopsServicesWhenMigrationCannotStop(t *testing.T) {
	m, r, _ := customLifecycleManager(t, "migration-stop")
	r.migrationOwned = true
	err := m.stopFailedRecovery(errors.New("interrupted publication"))
	if err == nil || !strings.Contains(err.Error(), "禁止恢复数据库") || !r.stopped {
		t.Fatalf("writers not contained: error=%v stopped=%v", err, r.stopped)
	}
}

func TestCustomDataRecoveryProtectsOriginalOverlay(t *testing.T) {
	m, data := localDataManager(t)
	if err := m.savePreviousDeployment(); err != nil {
		t.Fatal(err)
	}
	// The data mount must not contain an original overlay, even when the frozen
	// execution config, env and backup all live safely outside it.
	overlay := filepath.Join(data, "production.yml")
	if err := os.WriteFile(overlay, []byte("original configuration\n"), 0600); err != nil {
		t.Fatal(err)
	}
	m.custom = &CustomProfile{ProjectName: composeProjectName(m.config.InstallDir), ComposeFiles: []string{overlay}}
	if err := replaceFile(m.previousComposePath(), m.composePath(), 0600); err != nil {
		t.Fatal(err)
	}
	_, err := m.localDataRootFrom("v1.1.0", m.previousComposePath(), m.previousEnvPath())
	if err == nil || !strings.Contains(err.Error(), "拒绝覆盖") {
		t.Fatalf("unsafe original overlay accepted: %v", err)
	}
	if body, _ := os.ReadFile(overlay); string(body) != "original configuration\n" {
		t.Fatal("original overlay changed")
	}
}

func TestCustomDatabaseRestoreDoesNotPublishCommandOutput(t *testing.T) {
	m, _ := localDataManager(t)
	m.custom = &CustomProfile{ProjectName: composeProjectName(m.config.InstallDir)}
	config := []byte(`{"services":{"postgres":{"environment":{"POSTGRES_USER":"fixture","POSTGRES_DB":"fixture"}}}}`)
	if err := os.WriteFile(filepath.Join(m.config.InstallDir, "bin", "config.json"), config, 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOSTUPDATE_FIXTURE_FAIL", "pg_restore")
	err := m.restoreDatabase(regularDataFixture(t, m))
	if err == nil || strings.Contains(err.Error(), "injected-pg_restore") || !strings.Contains(err.Error(), "详细输出不公开") {
		t.Fatalf("restore output leaked: %v", err)
	}
}

func TestCustomWebLifecycleKeepsDatabaseAndOriginalFiles(t *testing.T) {
	for _, failure := range []string{"", "publish", "verify", "startup", "preflight", "environment", "project", "commit", "config-drift", "migration-active"} {
		t.Run(failure, func(t *testing.T) {
			m, r, to := customLifecycleManager(t, failure)
			before := map[string]string{}
			for _, path := range append([]string{m.envPath()}, m.custom.ComposeFiles...) {
				before[path], _ = fileCustomHash(path)
			}
			m.runCustomUpdate(fixtureCustomRelease("old"), to)
			status := m.Snapshot()
			want := PhaseFailed
			if failure == "" {
				want = PhaseSucceeded
			}
			if failure == "publish" || failure == "verify" || failure == "startup" {
				want = PhaseRolledBack
			}
			if status.Operation.Phase != want {
				t.Fatalf("phase=%s want=%s error=%s calls=%v", status.Operation.Phase, want, status.Operation.Error, r.calls)
			}
			if strings.Contains(status.Operation.Error, "credential-should-not-leak") {
				t.Fatal("publisher output exposed")
			}
			joined := strings.Join(r.calls, "\n")
			for _, forbidden := range []string{"pg_dump", "pg_restore", "dropdb", "createdb", " migrate", " stop web backend", "--remove-orphans", "https://api.github.com"} {
				if strings.Contains(joined, forbidden) {
					t.Fatalf("web-only release ran %q", forbidden)
				}
			}
			for path, hash := range before {
				actual, _ := fileCustomHash(path)
				if actual != hash && failure != "config-drift" {
					t.Fatal("source configuration changed")
				}
			}
			if failure == "" {
				current, err := m.currentCustomRelease()
				if err != nil || customHash(current) != customHash(to) {
					t.Fatalf("current=%+v err=%v", current, err)
				}
				if status.RollbackVersion != "old" || status.LastBackup != nil {
					t.Fatal("web-only rollback advertised a database backup")
				}
				if err := m.restoreCustomTransaction(m.state.CustomRollback, false); err != nil {
					t.Fatal(err)
				}
				current, _ = m.currentCustomRelease()
				if current.ID != "old" {
					t.Fatal("manual code rollback failed")
				}
			}
		})
	}
}

func TestCustomWebRequiresVerifiedHostPublisherBeforeStopping(t *testing.T) {
	for _, scenario := range []string{"missing", "tampered", "writable"} {
		t.Run(scenario, func(t *testing.T) {
			m, r, to := customLifecycleManager(t, "")
			if scenario == "missing" {
				m.custom.WebPublisher = ""
				m.custom.WebPublisherSHA256 = ""
			} else if scenario == "tampered" {
				_ = os.WriteFile(m.custom.WebPublisher, []byte("changed"), 0700)
			} else {
				_ = os.Chmod(m.custom.WebPublisher, 0777)
			}
			if scenario == "missing" {
				if _, err := m.Check(t.Context()); err != nil {
					t.Fatal(err)
				}
				if _, err := m.StartUpdate(to.ID); err == nil {
					t.Fatal("accepted missing publisher")
				}
			} else {
				m.runCustomUpdate(fixtureCustomRelease("old"), to)
			}
			if strings.Contains(strings.Join(r.calls, "\n"), " stop ") {
				t.Fatal("stopped before publisher validation")
			}
		})
	}
}

func TestCustomUnfinishedJournalCannotBeClearedByUIState(t *testing.T) {
	m, _, to := customLifecycleManager(t, "")
	if err := writeCustomFile(m.customJournalPath(), customTransaction{From: fixtureCustomRelease("old"), To: to, Stage: "switching"}); err != nil {
		t.Fatal(err)
	}
	m.state.Operation = Operation{Phase: PhaseIdle}
	if _, err := m.Check(t.Context()); err == nil {
		t.Fatal("check ignored interrupted transaction")
	}
	if _, err := m.StartUpdate(to.ID); err == nil {
		t.Fatal("update ignored interrupted transaction")
	}
	if _, err := m.StartRollback("fixture"); err == nil {
		t.Fatal("rollback ignored interrupted transaction")
	}
}

func TestCustomDatabaseTargetMustMatchBackupService(t *testing.T) {
	for _, scenario := range []string{"external-host", "different-database", "migration-other-database", "query-host-override", "auto-migrate", "sqlite"} {
		t.Run(scenario, func(t *testing.T) {
			m, r, to := customLifecycleManager(t, "")
			services := r.base["services"].(map[string]any)
			backend := services["backend"].(map[string]any)["environment"].(map[string]string)
			migrate := services["migrate"].(map[string]any)["environment"].(map[string]string)
			switch scenario {
			case "external-host":
				backend["DATABASE_URL"] = "postgresql://fixture:password@outside:5432/fixture"
				migrate["DATABASE_URL"] = backend["DATABASE_URL"]
			case "different-database":
				backend["DATABASE_URL"] = "postgresql://fixture:password@postgres:5432/other"
				migrate["DATABASE_URL"] = backend["DATABASE_URL"]
			case "migration-other-database":
				migrate["DATABASE_URL"] = "postgresql://fixture:password@postgres:5432/other"
			case "query-host-override":
				backend["DATABASE_URL"] += "&host=outside"
				migrate["DATABASE_URL"] = backend["DATABASE_URL"]
			case "auto-migrate":
				backend["CANVAS_AUTO_MIGRATE"] = "true"
			case "sqlite":
				backend["CANVAS_DATABASE_DRIVER"] = "sqlite"
			}
			m.runCustomUpdate(fixtureCustomRelease("old"), to)
			if m.Snapshot().Operation.Phase != PhaseFailed || strings.Contains(strings.Join(r.calls, "\n"), " stop ") {
				t.Fatalf("unsafe database contract accepted: %v", r.calls)
			}
		})
	}
}

func TestCustomPublicLifecycleAndStatusDoNotExposePrivateConfiguration(t *testing.T) {
	m, _, to := customLifecycleManager(t, "")
	if _, err := m.Check(t.Context()); err != nil {
		t.Fatal(err)
	}
	if _, err := m.StartUpdate(to.ID); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		status := m.Snapshot()
		body, _ := json.Marshal(status)
		if bytes.Contains(body, []byte(m.config.StateDir)) || bytes.Contains(body, []byte("a$quoted")) {
			t.Fatal("private path or environment leaked into public status")
		}
		if status.Operation.Phase == PhaseSucceeded {
			return
		}
		if status.Operation.Phase == PhaseFailed || status.Operation.Phase == PhaseManualIntervention {
			t.Fatal(status.Operation.Error)
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("public update lifecycle did not finish")
}
