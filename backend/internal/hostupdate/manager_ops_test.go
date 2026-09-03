package hostupdate

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type recordingRunner struct {
	calls [][]string
	input []byte
}

func (r *recordingRunner) Run(_ context.Context, _ string, args, _ []string, stdout, _ io.Writer) error {
	r.calls = append(r.calls, append([]string(nil), args...))
	if stdout != nil {
		_, _ = io.WriteString(stdout, "backup-fixture")
	}
	return nil
}

func (r *recordingRunner) RunWithInput(_ context.Context, _ string, args, _ []string, stdin io.Reader, _ io.Writer, _ io.Writer) error {
	r.calls = append(r.calls, append([]string(nil), args...))
	data, err := io.ReadAll(stdin)
	if err != nil {
		return err
	}
	r.input = data
	return nil
}

func TestSetEnvValuePreservesOtherSettings(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, ".env")
	if err := os.WriteFile(path, []byte("# keep\nCANVAS_IMAGE_TAG=1.0.0\nPOSTGRES_DB=canvas\n"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := setEnvValue(path, "CANVAS_IMAGE_TAG", "1.2.2-preview.1"); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	value := string(data)
	if !strings.Contains(value, "# keep\n") || !strings.Contains(value, "POSTGRES_DB=canvas\n") || !strings.Contains(value, "CANVAS_IMAGE_TAG=1.2.2-preview.1\n") {
		t.Fatalf("unexpected env contents: %q", value)
	}
	stat, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if stat.Mode().Perm() != 0o640 {
		t.Fatalf("mode=%o, want 640", stat.Mode().Perm())
	}
}

func TestVerifyZipBackupRejectsCorruption(t *testing.T) {
	path := filepath.Join(t.TempDir(), "backup.zip")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, content := range map[string]string{
		"metadata.json":    "{}",
		"database.dump":    "database",
		"backend-data.tar": "data",
	} {
		entry, createErr := archive.Create(name)
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := io.WriteString(entry, content); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	checksum := "sha256:" + hex.EncodeToString(hash[:])
	if err := verifyZipBackup(path, checksum); err != nil {
		t.Fatalf("valid backup rejected: %v", err)
	}
	if err := os.WriteFile(path, append(data, byte(1)), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := verifyZipBackup(path, checksum); err == nil {
		t.Fatal("corrupted backup was accepted")
	}
}

func TestCurrentVersionRejectsLatest(t *testing.T) {
	installDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("CANVAS_IMAGE_TAG=latest\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	manager := &Manager{config: Config{InstallDir: installDir, EnvFile: ".env"}}
	if _, err := manager.currentVersion(); err == nil {
		t.Fatal("latest tag was accepted")
	}
}

func TestCreateBackupReadsStoppedBackendDataAsRoot(t *testing.T) {
	installDir := t.TempDir()
	backupDir := filepath.Join(installDir, "backups")
	if err := os.MkdirAll(backupDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(installDir, ".env"), []byte("POSTGRES_USER=canvas\nPOSTGRES_DB=canvas\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runner := &recordingRunner{}
	manager := &Manager{
		config: Config{InstallDir: installDir, ComposeFile: "docker-compose.deploy.yml", EnvFile: ".env", BackupDir: backupDir},
		runner: runner,
	}
	if _, err := manager.createBackup("v1.2.2-preview.2"); err != nil {
		t.Fatal(err)
	}
	for _, call := range runner.calls {
		joined := strings.Join(call, " ")
		if strings.Contains(joined, "run --rm --no-deps -T --user root backend tar -C /data -cf - .") {
			return
		}
	}
	t.Fatalf("backend data backup did not use root: %#v", runner.calls)
}

func TestBackendDataRestoreScriptReplacesVisibleAndHiddenEntries(t *testing.T) {
	dataDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dataDir, "old.txt"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dataDir, ".old-hidden"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	var archive bytes.Buffer
	writer := tar.NewWriter(&archive)
	for name, content := range map[string]string{"new.txt": "new", ".new-hidden": "new"} {
		if err := writer.WriteHeader(&tar.Header{Name: name, Mode: 0o600, Size: int64(len(content))}); err != nil {
			t.Fatal(err)
		}
		if _, err := io.WriteString(writer, content); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	restore := exec.Command("sh", "-ceu", backendDataRestoreScript, "canvas-backend-data-restore", dataDir)
	restore.Stdin = bytes.NewReader(archive.Bytes())
	if output, err := restore.CombinedOutput(); err != nil {
		t.Fatalf("restore failed: %v: %s", err, output)
	}
	for _, name := range []string{"new.txt", ".new-hidden"} {
		if _, err := os.Stat(filepath.Join(dataDir, name)); err != nil {
			t.Fatalf("restored entry %s missing: %v", name, err)
		}
	}
	for _, name := range []string{"old.txt", ".old-hidden", ".canvas-updater-restore", ".canvas-updater-previous"} {
		if _, err := os.Stat(filepath.Join(dataDir, name)); !os.IsNotExist(err) {
			t.Fatalf("stale entry %s still exists", name)
		}
	}
}

func TestBackendDataRestoreScriptKeepsLiveDataWhenArchiveIsInvalid(t *testing.T) {
	dataDir := t.TempDir()
	oldPath := filepath.Join(dataDir, "old.txt")
	if err := os.WriteFile(oldPath, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	restore := exec.Command("sh", "-ceu", backendDataRestoreScript, "canvas-backend-data-restore", dataDir)
	restore.Stdin = strings.NewReader("not-a-tar")
	if err := restore.Run(); err == nil {
		t.Fatal("invalid archive unexpectedly restored")
	}
	data, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "old" {
		t.Fatalf("live data changed to %q", data)
	}
	if _, err := os.Stat(filepath.Join(dataDir, ".canvas-updater-restore")); !os.IsNotExist(err) {
		t.Fatal("failed extraction left staging data behind")
	}
}

func TestBackendDataRestoreScriptRefusesUnresolvedPreviousData(t *testing.T) {
	dataDir := t.TempDir()
	previousDir := filepath.Join(dataDir, ".canvas-updater-previous")
	if err := os.Mkdir(previousDir, 0o700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(previousDir, "preserve.txt")
	if err := os.WriteFile(marker, []byte("preserve"), 0o600); err != nil {
		t.Fatal(err)
	}
	restore := exec.Command("sh", "-ceu", backendDataRestoreScript, "canvas-backend-data-restore", dataDir)
	restore.Stdin = strings.NewReader("not-used")
	if err := restore.Run(); err == nil {
		t.Fatal("restore unexpectedly overwrote unresolved previous data")
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("previous recovery data was not preserved: %v", err)
	}
}

func TestRestoreBackendDataStreamsVerifiedArchiveToStoppedServiceVolume(t *testing.T) {
	installDir := t.TempDir()
	backupPath := filepath.Join(installDir, "backup.zip")
	file, err := os.Create(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	archive := zip.NewWriter(file)
	for name, content := range map[string]string{
		"metadata.json":    "{}",
		"database.dump":    "database",
		"backend-data.tar": "tar-fixture",
	} {
		entry, createErr := archive.Create(name)
		if createErr != nil {
			t.Fatal(createErr)
		}
		if _, writeErr := io.WriteString(entry, content); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(data)
	runner := &recordingRunner{}
	manager := &Manager{
		config: Config{InstallDir: installDir, ComposeFile: "docker-compose.deploy.yml", EnvFile: ".env", StepTimeout: time.Minute},
		runner: runner,
	}
	backup := Backup{Path: backupPath, Checksum: "sha256:" + hex.EncodeToString(hash[:]), Version: "v1.2.2-preview.4"}
	if err := manager.restoreBackendData(backup); err != nil {
		t.Fatal(err)
	}
	if string(runner.input) != "tar-fixture" {
		t.Fatalf("stdin=%q, want tar-fixture", runner.input)
	}
	if len(runner.calls) != 1 {
		t.Fatalf("calls=%d, want 1", len(runner.calls))
	}
	joined := strings.Join(runner.calls[0], " ")
	for _, required := range []string{"run --rm --no-deps -T --user root backend", "canvas-backend-data-restore /data"} {
		if !strings.Contains(joined, required) {
			t.Fatalf("restore command missing %q: %s", required, joined)
		}
	}
}
