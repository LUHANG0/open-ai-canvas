//go:build integration

package hostupdate

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

const integrationUpdaterToken = "local-host-updater-integration-token"

type dockerIntegrationRunner struct {
	exec execRunner
}

func (r dockerIntegrationRunner) Run(ctx context.Context, name string, args, environment []string, stdout, stderr io.Writer) error {
	if name == "docker" && containsSequence(args, "pull", "backend", "web") {
		return nil
	}
	if name == "docker" && containsSequence(args, "image", "inspect") {
		_, err := io.WriteString(stdout, `["local.invalid/candidate@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]`)
		return err
	}
	return r.exec.Run(ctx, name, args, environment, stdout, stderr)
}

func (r dockerIntegrationRunner) RunWithInput(ctx context.Context, name string, args, environment []string, stdin io.Reader, stdout, stderr io.Writer) error {
	return r.exec.RunWithInput(ctx, name, args, environment, stdin, stdout, stderr)
}

func TestHostUpdaterDockerRollbackRestoresDatabaseAndBackendData(t *testing.T) {
	oldImage := requireIntegrationImage(t, "CANVAS_HOSTUPDATE_INTEGRATION_OLD_IMAGE")
	targetImage := requireIntegrationImage(t, "CANVAS_HOSTUPDATE_INTEGRATION_TARGET_IMAGE")
	oldVersion := integrationVersion("CANVAS_HOSTUPDATE_INTEGRATION_OLD_VERSION", "v1.2.2-preview.3")
	targetVersion := integrationVersion("CANVAS_HOSTUPDATE_INTEGRATION_TARGET_VERSION", "v1.2.2-preview.4")
	installDir := t.TempDir()
	stateDir := filepath.Join(installDir, "state")
	backupDir := filepath.Join(installDir, "backups")
	project := fmt.Sprintf("canvasupdaterdrill%d", time.Now().UnixNano())
	healthPort := reserveTCPPort(t)
	composePath := filepath.Join(installDir, "docker-compose.deploy.yml")
	envPath := filepath.Join(installDir, ".env")

	writeIntegrationFile(t, envPath, strings.Join([]string{
		"CANVAS_IMAGE_TAG=" + strings.TrimPrefix(oldVersion, "v"),
		"POSTGRES_DB=canvas",
		"POSTGRES_USER=canvas",
		"POSTGRES_PASSWORD=local-updater-drill-only",
		"DATABASE_URL=postgres://canvas:local-updater-drill-only@postgres:5432/canvas?sslmode=disable",
		"",
	}, "\n"))
	writeIntegrationFile(t, composePath, integrationOldCompose(project, healthPort, oldImage))

	realRunner := execRunner{dir: installDir}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
		defer cancel()
		_ = realRunner.Run(ctx, "docker", []string{"compose", "--env-file", envPath, "-f", composePath, "down", "-v", "--remove-orphans"}, nil, io.Discard, io.Discard)
	})
	runDocker(t, realRunner, envPath, composePath, nil, "up", "-d", "--wait", "--wait-timeout", "120")

	runDocker(t, realRunner, envPath, composePath, nil, "exec", "-T", "postgres", "psql", "-U", "canvas", "-d", "canvas", "-v", "ON_ERROR_STOP=1", "-c", "CREATE TABLE rc_rollback_probe (id integer PRIMARY KEY, value text NOT NULL); INSERT INTO rc_rollback_probe VALUES (1, 'before');")
	runDocker(t, realRunner, envPath, composePath, nil, "exec", "-T", "--user", "root", "backend", "sh", "-ceu", "mkdir -p /data/media; printf before > /data/media/probe.bin; printf hidden-before > /data/.hidden-probe")
	beforeHash := readDockerOutput(t, realRunner, envPath, composePath, "exec", "-T", "--user", "root", "backend", "sha256sum", "/data/media/probe.bin")
	t.Logf("pre-failure evidence: database=before media=%s hidden=hidden-before", strings.TrimSpace(beforeHash))

	manager, err := NewManager(Config{
		Repository:   "local/integration",
		InstallDir:   installDir,
		ComposeFile:  filepath.Base(composePath),
		EnvFile:      filepath.Base(envPath),
		StateDir:     stateDir,
		BackupDir:    backupDir,
		HealthURL:    fmt.Sprintf("http://127.0.0.1:%d/api/health/ready", healthPort),
		StableWindow: 100 * time.Millisecond,
		StepTimeout:  2 * time.Minute,
		SelfUpdate:   false,
	})
	if err != nil {
		t.Fatal(err)
	}
	manager.runner = dockerIntegrationRunner{exec: realRunner}
	manager.httpClient = &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if strings.Contains(request.URL.Path, "docker-compose.deploy.yml") {
			return textResponse(http.StatusOK, integrationFailingTargetCompose(project, healthPort, targetImage)), nil
		}
		return http.DefaultTransport.RoundTrip(request)
	})}
	manager.state.LatestRelease = &Release{Version: targetVersion, Prerelease: true}

	server, err := NewServer(manager, integrationUpdaterToken)
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()

	postUpdater(t, httpServer.URL+"/v1/update", fmt.Sprintf(`{"targetVersion":%q}`, targetVersion), http.StatusAccepted)
	automatic := waitForUpdaterTerminal(t, httpServer.URL)
	if automatic.Operation.Phase != PhaseRolledBack || !automatic.Operation.AutomaticRollback {
		t.Fatalf("automatic rollback status=%s automatic=%t error=%q rollback=%q", automatic.Operation.Phase, automatic.Operation.AutomaticRollback, automatic.Operation.Error, automatic.Operation.RollbackError)
	}
	assertRollbackData(t, realRunner, envPath, composePath, beforeHash)
	assertReadyVersion(t, manager.config.HealthURL, oldVersion)
	manager.mu.Lock()
	persistedBackup := *manager.state.LastBackup
	manager.mu.Unlock()
	assertBackupContains(t, &persistedBackup, "database.dump", "backend-data.tar")
	t.Logf("automatic rollback: phase=%s database=before media restored schema=ready backup=%s", automatic.Operation.Phase, persistedBackup.Checksum)

	postUpdater(t, httpServer.URL+"/v1/rollback", `{"reason":"repeatability drill"}`, http.StatusAccepted)
	repeated := waitForUpdaterTerminal(t, httpServer.URL)
	if repeated.Operation.Phase != PhaseRolledBack || repeated.Operation.AutomaticRollback {
		t.Fatalf("repeat rollback status=%s automatic=%t rollback=%q", repeated.Operation.Phase, repeated.Operation.AutomaticRollback, repeated.Operation.RollbackError)
	}
	assertRollbackData(t, realRunner, envPath, composePath, beforeHash)
	assertReadyVersion(t, manager.config.HealthURL, oldVersion)
	t.Logf("repeat manual rollback: phase=%s database/media/schema unchanged", repeated.Operation.Phase)

	runDocker(t, realRunner, envPath, composePath, nil, "exec", "-T", "--user", "root", "backend", "sh", "-ceu", "mkdir /data/.canvas-updater-previous; printf preserve > /data/.canvas-updater-previous/manual-marker")
	postUpdater(t, httpServer.URL+"/v1/rollback", `{"reason":"fail-closed drill"}`, http.StatusAccepted)
	failed := waitForUpdaterTerminal(t, httpServer.URL)
	if failed.Operation.Phase != PhaseManualIntervention || failed.Operation.RollbackError == "" {
		t.Fatalf("failed rollback status=%s rollback=%q", failed.Operation.Phase, failed.Operation.RollbackError)
	}
	for _, service := range []string{"backend", "web"} {
		state := strings.TrimSpace(readDockerOutput(t, realRunner, envPath, composePath, "ps", "--status", "running", "--services", service))
		if state != "" {
			t.Fatalf("%s restarted after restore failure: %q", service, state)
		}
	}
	marker := strings.TrimSpace(readDockerOutput(t, realRunner, envPath, composePath, "run", "--rm", "--no-deps", "-T", "--user", "root", "backend", "sh", "-ceu", "cat /data/.canvas-updater-previous/manual-marker"))
	if marker != "preserve" {
		t.Fatalf("manual recovery marker=%q, want preserve", marker)
	}

	encoded, _ := json.MarshalIndent(failed, "", "  ")
	t.Logf("final updater status:\n%s", encoded)
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func textResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func requireIntegrationImage(t *testing.T, key string) string {
	t.Helper()
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		t.Skipf("%s is required for the isolated Docker integration drill", key)
	}
	if strings.ContainsAny(value, "\r\n") {
		t.Fatalf("%s contains a newline", key)
	}
	return value
}

func integrationVersion(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func reserveTCPPort(t *testing.T) int {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	return listener.Addr().(*net.TCPAddr).Port
}

func writeIntegrationFile(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(contents), 0o600); err != nil {
		t.Fatal(err)
	}
}

func runDocker(t *testing.T, runner execRunner, envPath, composePath string, stdin io.Reader, arguments ...string) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	args := []string{"compose", "--env-file", envPath, "-f", composePath}
	args = append(args, arguments...)
	var output bytes.Buffer
	if err := runner.RunWithInput(ctx, "docker", args, nil, stdin, &output, &output); err != nil {
		t.Fatalf("docker %s failed: %v\n%s", strings.Join(args, " "), err, output.String())
	}
}

func readDockerOutput(t *testing.T, runner execRunner, envPath, composePath string, arguments ...string) string {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	args := []string{"compose", "--env-file", envPath, "-f", composePath}
	args = append(args, arguments...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if err := runner.Run(ctx, "docker", args, nil, &stdout, &stderr); err != nil {
		t.Fatalf("docker %s failed: %v\n%s", strings.Join(args, " "), err, stderr.String())
	}
	return stdout.String()
}

func postUpdater(t *testing.T, url, body string, wantStatus int) {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+integrationUpdaterToken)
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(response.Body)
	if response.StatusCode != wantStatus {
		t.Fatalf("POST %s status=%d want=%d body=%s", url, response.StatusCode, wantStatus, data)
	}
}

func waitForUpdaterTerminal(t *testing.T, baseURL string) Status {
	t.Helper()
	deadline := time.Now().Add(3 * time.Minute)
	for time.Now().Before(deadline) {
		request, err := http.NewRequest(http.MethodGet, baseURL+"/v1/status", nil)
		if err != nil {
			t.Fatal(err)
		}
		request.Header.Set("Authorization", "Bearer "+integrationUpdaterToken)
		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatal(err)
		}
		var status Status
		decodeErr := json.NewDecoder(response.Body).Decode(&status)
		response.Body.Close()
		if decodeErr != nil {
			t.Fatal(decodeErr)
		}
		if !status.Operation.Phase.Active() {
			return status
		}
		time.Sleep(250 * time.Millisecond)
	}
	t.Fatal("host updater did not reach a terminal phase")
	return Status{}
}

func assertRollbackData(t *testing.T, runner execRunner, envPath, composePath, beforeHash string) {
	t.Helper()
	value := strings.TrimSpace(readDockerOutput(t, runner, envPath, composePath, "exec", "-T", "postgres", "psql", "-U", "canvas", "-d", "canvas", "-At", "-c", "SELECT value FROM rc_rollback_probe WHERE id = 1"))
	if value != "before" {
		t.Fatalf("database value=%q, want before", value)
	}
	hash := readDockerOutput(t, runner, envPath, composePath, "exec", "-T", "--user", "root", "backend", "sha256sum", "/data/media/probe.bin")
	if hash != beforeHash {
		t.Fatalf("media hash=%q, want %q", hash, beforeHash)
	}
	hidden := strings.TrimSpace(readDockerOutput(t, runner, envPath, composePath, "exec", "-T", "--user", "root", "backend", "cat", "/data/.hidden-probe"))
	if hidden != "hidden-before" {
		t.Fatalf("hidden marker=%q, want hidden-before", hidden)
	}
	targetOnly := strings.TrimSpace(readDockerOutput(t, runner, envPath, composePath, "exec", "-T", "--user", "root", "backend", "sh", "-ceu", "if [ -e /data/target-only.txt ]; then printf present; fi"))
	if targetOnly != "" {
		t.Fatalf("target-only data survived rollback: %q", targetOnly)
	}
}

func assertReadyVersion(t *testing.T, healthURL, version string) {
	t.Helper()
	response, err := http.Get(healthURL)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	var envelope struct {
		Data struct {
			Ready bool `json:"ready"`
			Build struct {
				Version string `json:"version"`
			} `json:"build"`
			Schema struct {
				Current  int  `json:"current"`
				Expected int  `json:"expected"`
				Ready    bool `json:"ready"`
			} `json:"schema"`
			Checks map[string]bool `json:"checks"`
		} `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK || !envelope.Data.Ready || envelope.Data.Build.Version != version || !envelope.Data.Schema.Ready || envelope.Data.Schema.Current != envelope.Data.Schema.Expected || !envelope.Data.Checks["database"] || !envelope.Data.Checks["runtime"] || !envelope.Data.Checks["schema"] {
		t.Fatalf("unexpected readiness: status=%d data=%+v", response.StatusCode, envelope.Data)
	}
}

func assertBackupContains(t *testing.T, backup *Backup, names ...string) {
	t.Helper()
	if backup == nil {
		t.Fatal("host updater did not persist a backup")
	}
	if err := verifyZipBackup(backup.Path, backup.Checksum); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(backup.Path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	if backup.Checksum != "sha256:"+hex.EncodeToString(hash[:]) {
		t.Fatalf("backup checksum mismatch: %s", backup.Checksum)
	}
	archive, err := zip.OpenReader(backup.Path)
	if err != nil {
		t.Fatal(err)
	}
	defer archive.Close()
	for _, name := range names {
		found := false
		for _, entry := range archive.File {
			if entry.Name == name && entry.UncompressedSize64 > 0 {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("backup does not contain %s", name)
		}
	}
}

func containsSequence(values []string, wanted ...string) bool {
	for index := 0; index+len(wanted) <= len(values); index++ {
		match := true
		for offset := range wanted {
			if values[index+offset] != wanted[offset] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func integrationOldCompose(project string, healthPort int, oldImage string) string {
	return fmt.Sprintf(`name: %s
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: canvas
      POSTGRES_USER: canvas
      POSTGRES_PASSWORD: local-updater-drill-only
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U canvas -d canvas"]
      interval: 1s
      timeout: 3s
      retries: 30
  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 1s
      timeout: 3s
      retries: 30
  migrate:
    image: %s
    command: ["migrate-schema", "up"]
    environment:
      CANVAS_DATABASE_DRIVER: postgres
      DATABASE_URL: postgres://canvas:local-updater-drill-only@postgres:5432/canvas?sslmode=disable
    depends_on:
      postgres:
        condition: service_healthy
  backend:
    image: %s
    environment:
      CANVAS_BACKEND_ADDR: ":8080"
      CANVAS_BACKEND_DATA_DIR: /data
      CANVAS_AUTO_MIGRATE: "false"
      CANVAS_DATABASE_DRIVER: postgres
      DATABASE_URL: postgres://canvas:local-updater-drill-only@postgres:5432/canvas?sslmode=disable
      REDIS_URL: redis://redis:6379/0
      GIN_MODE: release
    ports:
      - "127.0.0.1:%d:8080"
    volumes:
      - backend-data:/data
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
  web:
    image: alpine:3.22
    command: ["sh", "-ceu", "while :; do sleep 3600; done"]
    depends_on:
      backend:
        condition: service_healthy
volumes:
  postgres-data:
  redis-data:
  backend-data:
`, project, strconv.Quote(oldImage), strconv.Quote(oldImage), healthPort)
}

func integrationFailingTargetCompose(project string, healthPort int, targetImage string) string {
	return fmt.Sprintf(`name: %s
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: canvas
      POSTGRES_USER: canvas
      POSTGRES_PASSWORD: local-updater-drill-only
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U canvas -d canvas"]
      interval: 1s
      timeout: 3s
      retries: 30
  redis:
    image: redis:7.4-alpine
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 1s
      timeout: 3s
      retries: 30
  migrate:
    image: postgres:17-alpine
    user: root
    command:
      - sh
      - -ceu
      - |
        psql "$$DATABASE_URL" -v ON_ERROR_STOP=1 -c "UPDATE rc_rollback_probe SET value='after' WHERE id=1;"
        printf after > /data/media/probe.bin
        printf target-only > /data/target-only.txt
        exit 42
    environment:
      DATABASE_URL: postgres://canvas:local-updater-drill-only@postgres:5432/canvas?sslmode=disable
    volumes:
      - backend-data:/data
    depends_on:
      postgres:
        condition: service_healthy
  backend:
    image: %s
    environment:
      CANVAS_BACKEND_ADDR: ":8080"
      CANVAS_BACKEND_DATA_DIR: /data
      CANVAS_AUTO_MIGRATE: "false"
      CANVAS_DATABASE_DRIVER: postgres
      DATABASE_URL: postgres://canvas:local-updater-drill-only@postgres:5432/canvas?sslmode=disable
      REDIS_URL: redis://redis:6379/0
      GIN_MODE: release
    ports:
      - "127.0.0.1:%d:8080"
    volumes:
      - backend-data:/data
  web:
    image: alpine:3.22
    command: ["sh", "-ceu", "while :; do sleep 3600; done"]
volumes:
  postgres-data:
  redis-data:
  backend-data:
`, project, strconv.Quote(targetImage), healthPort)
}
