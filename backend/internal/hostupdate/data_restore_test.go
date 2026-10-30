package hostupdate

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func dataBackupFixture(t *testing.T, manager *Manager, entries []*tar.Header, bodies map[string][]byte) Backup {
	t.Helper()
	var data bytes.Buffer
	tw := tar.NewWriter(&data)
	for _, h := range entries {
		if err := tw.WriteHeader(h); err != nil {
			t.Fatal(err)
		}
		if b := bodies[h.Name]; len(b) > 0 {
			if _, err := tw.Write(b); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	for name, body := range map[string][]byte{"metadata.json": []byte(`{"version":"v1.1.0","format":1}`), "database.dump": []byte("fixture-pg-dump"), "backend-data.tar": data.Bytes()} {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write(body); err != nil {
			t.Fatal(err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(manager.config.BackupDir, "fixture.zip")
	if err := os.WriteFile(path, buf.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	hash := sha256.Sum256(buf.Bytes())
	return Backup{ID: "fixture", Path: path, Checksum: "sha256:" + hex.EncodeToString(hash[:]), Version: "v1.1.0"}
}
func regularDataFixture(t *testing.T, manager *Manager) Backup {
	t.Helper()
	entries := []*tar.Header{{Name: "./", Typeflag: tar.TypeDir, Mode: 0750, Uid: os.Getuid(), Gid: os.Getgid()}, {Name: "./resources/", Typeflag: tar.TypeDir, Mode: 0750, Uid: os.Getuid(), Gid: os.Getgid()}}
	bodies := map[string][]byte{"./resources/changed.txt": []byte("old-content"), "./resources/deleted.txt": []byte("restore-deleted"), "./.settings-key": bytes.Repeat([]byte{1}, 32)}
	for _, name := range []string{"./resources/changed.txt", "./resources/deleted.txt", "./.settings-key"} {
		entries = append(entries, &tar.Header{Name: name, Typeflag: tar.TypeReg, Mode: 0600, Size: int64(len(bodies[name])), Uid: os.Getuid(), Gid: os.Getgid()})
	}
	return dataBackupFixture(t, manager, entries, bodies)
}
func localDataManager(t *testing.T) (*Manager, string) {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("Host Updater local data recovery requires a Linux host")
	}
	manager, _ := lifecycleManager(t, "")
	data := filepath.Join(manager.config.InstallDir, "data")
	if err := os.MkdirAll(filepath.Join(data, "resources"), 0750); err != nil {
		t.Fatal(err)
	}
	bin := filepath.Join(manager.config.InstallDir, "bin")
	if err := os.Mkdir(bin, 0700); err != nil {
		t.Fatal(err)
	}
	mount := map[string]any{"Id": "fixture-backend", "Mounts": []map[string]any{{"Type": "bind", "Source": data, "Destination": "/data", "RW": true}}, "Config": map[string]any{"Labels": map[string]string{"com.docker.compose.project": composeProjectName(manager.config.InstallDir)}}}
	config, _ := json.Marshal(map[string]any{"services": map[string]any{"backend": map[string]any{"volumes": []map[string]any{{"type": "bind", "source": data, "target": "/data"}}}}})
	if err := os.WriteFile(filepath.Join(bin, "config.json"), config, 0600); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal([]any{mount})
	if err := os.WriteFile(filepath.Join(bin, "inspect.json"), body, 0600); err != nil {
		t.Fatal(err)
	}
	script := fmt.Sprintf("#!/bin/sh\nset -eu\nif [ -n \"${HOSTUPDATE_FIXTURE_FAIL:-}\" ]; then case \" $* \" in *\" $HOSTUPDATE_FIXTURE_FAIL \"*) echo injected-$HOSTUPDATE_FIXTURE_FAIL >&2; exit 70;; esac; fi\nprintf '%%s\\n' \"$*\" >> %q\nif [ \"$1\" = context ]; then printf '\"unix:///var/run/docker.sock\"\\n'; elif [ \"$1\" = inspect ]; then cat %q; elif [ \"$1\" = volume ]; then cat %q; else case \" $* \" in *' config '*) cat %q;; *' ps '*) echo fixture-backend;; *pg_restore*) cat >/dev/null;; esac; fi\n", filepath.Join(bin, "calls.log"), filepath.Join(bin, "inspect.json"), filepath.Join(bin, "volume.json"), filepath.Join(bin, "config.json"))
	if err := os.WriteFile(filepath.Join(bin, "docker"), []byte(script), 0700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+":"+os.Getenv("PATH"))
	t.Setenv("DOCKER_HOST", "")
	t.Setenv("DOCKER_CONTEXT", "")
	manager.runner = execRunner{dir: manager.config.InstallDir}
	manager.httpClient = &http.Client{Transport: recoveryHealthTransport{`{"code":0,"data":{"ready":true,"started":true,"build":{"version":"v1.1.0"},"schema":{"current":61,"expected":61,"ready":true},"checks":{"database":true,"runtime":true,"schema":true}}}`}}
	return manager, data
}
func TestRollbackRestoresLocalFilesAndSettingsKey(t *testing.T) {
	manager, data := localDataManager(t)
	backup := regularDataFixture(t, manager)
	for name, body := range map[string][]byte{"resources/changed.txt": []byte("new-content"), "new-only.txt": []byte("new-only-preserve-in-recovery"), ".settings-key": bytes.Repeat([]byte{2}, 32)} {
		if err := os.WriteFile(filepath.Join(data, name), body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	outside := filepath.Join(manager.config.InstallDir, "outside.txt")
	if err := os.WriteFile(outside, []byte("outside-untouched"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(data, "external-link")); err != nil {
		t.Fatal(err)
	}
	if err := manager.savePreviousDeployment(); err != nil {
		t.Fatal(err)
	}
	manager.runRollback("v1.1.0", backup, true)
	if manager.state.Operation.Phase != PhaseRolledBack {
		t.Fatalf("phase=%s error=%s", manager.state.Operation.Phase, manager.state.Operation.RollbackError)
	}
	for name, want := range map[string][]byte{"resources/changed.txt": []byte("old-content"), "resources/deleted.txt": []byte("restore-deleted"), ".settings-key": bytes.Repeat([]byte{1}, 32)} {
		got, err := os.ReadFile(filepath.Join(data, name))
		if err != nil || !bytes.Equal(got, want) {
			t.Errorf("%s not restored: %q, %v", name, got, err)
		}
	}
	for _, name := range []string{"new-only.txt", "external-link"} {
		if _, err := os.Lstat(filepath.Join(data, name)); !os.IsNotExist(err) {
			t.Errorf("post-backup entry remains active: %s, %v", name, err)
		}
	}
	if got, _ := os.ReadFile(outside); string(got) != "outside-untouched" {
		t.Fatal("outside file changed")
	}
	entries, err := os.ReadDir(data)
	if err != nil {
		t.Fatal(err)
	}
	retained := false
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".host-updater-recovery-") {
			got, _ := os.ReadFile(filepath.Join(data, entry.Name(), "previous", "new-only.txt"))
			retained = string(got) == "new-only-preserve-in-recovery"
		}
	}
	if !retained {
		t.Error("displaced new-only data was not retained for manual recovery")
	}
}

func TestDataSnapshotRejectsUnsafeEntries(t *testing.T) {
	for _, scenario := range []string{"parent", "absolute", "backslash", "duplicate", "symlink", "hardlink", "device", "fifo", "key-size", "key-directory", "implicit-key-directory", "reserved", "truncated", "crc"} {
		t.Run(scenario, func(t *testing.T) {
			manager, _ := localDataManager(t)
			headers := []*tar.Header{{Name: "./", Typeflag: tar.TypeDir, Mode: 0755, Uid: os.Getuid(), Gid: os.Getgid()}}
			h := &tar.Header{Name: "file", Typeflag: tar.TypeReg, Mode: 0600, Uid: os.Getuid(), Gid: os.Getgid(), Size: 3}
			bodies := map[string][]byte{"file": []byte("old")}
			switch scenario {
			case "parent":
				h.Name = "../escape"
			case "absolute":
				h.Name = "/escape"
			case "backslash":
				h.Name = `..\escape`
			case "duplicate":
				headers = append(headers, h)
				h = &tar.Header{Name: "./file", Typeflag: tar.TypeReg, Mode: 0600}
			case "symlink":
				h.Typeflag = tar.TypeSymlink
				h.Linkname = "/outside"
				h.Size = 0
			case "hardlink":
				h.Typeflag = tar.TypeLink
				h.Linkname = "file"
				h.Size = 0
			case "device":
				h.Typeflag = tar.TypeChar
				h.Size = 0
			case "fifo":
				h.Typeflag = tar.TypeFifo
				h.Size = 0
			case "key-size":
				h.Name = ".settings-key"
			case "key-directory":
				h.Name = ".settings-key"
				h.Typeflag = tar.TypeDir
				h.Size = 0
			case "implicit-key-directory":
				h.Name = ".settings-key/child"
			case "reserved":
				h.Name = recoveryPrefix + "reserved/file"
			}
			if scenario != "duplicate" {
				delete(bodies, "file")
				bodies[h.Name] = []byte("old")
			}
			if h.Size == 0 {
				delete(bodies, h.Name)
			}
			headers = append(headers, h)
			backup := dataBackupFixture(t, manager, headers, bodies)
			archive, err := zip.OpenReader(backup.Path)
			if err != nil {
				t.Fatal(err)
			}
			defer archive.Close()
			var data []byte
			for _, entry := range archive.File {
				if entry.Name == "backend-data.tar" {
					reader, err := entry.Open()
					if err != nil {
						t.Fatal(err)
					}
					data, err = io.ReadAll(reader)
					reader.Close()
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			var reader io.Reader = bytes.NewReader(data)
			if scenario == "truncated" {
				reader = bytes.NewReader(data[:513])
			}
			if scenario == "crc" {
				reader = &snapshotErrorReader{reader: bytes.NewReader(data)}
			}
			root, err := os.OpenRoot(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			defer root.Close()
			if _, err := extractDataSnapshot(root, reader, uint64(len(data))); err == nil {
				t.Fatal("unsafe or damaged archive accepted")
			}
		})
	}
}

type snapshotErrorReader struct{ reader io.Reader }

func (r *snapshotErrorReader) Read(p []byte) (int, error) {
	n, err := r.reader.Read(p)
	if err == io.EOF {
		return n, zip.ErrChecksum
	}
	return n, err
}

func TestDataRecoveryInterruptedSwitchLocksNewOperations(t *testing.T) {
	for _, stage := range []string{"preparing", "staged", "restoring-database", "switching", "installed"} {
		t.Run(stage, func(t *testing.T) {
			manager, data := localDataManager(t)
			backup := regularDataFixture(t, manager)
			if err := manager.savePreviousDeployment(); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(data, "new-only.txt"), []byte("keep-after-interruption"), 0600); err != nil {
				t.Fatal(err)
			}
			recovery, err := manager.stageLocalData("v1.1.0", backup)
			if err != nil {
				t.Fatal(err)
			}
			defer recovery.root.Close()
			if stage == "switching" {
				calls := 0
				err = recovery.installWithRename(func(from, to string) error {
					calls++
					if calls == 2 {
						return errors.New("interrupted-switch")
					}
					return recovery.root.Rename(from, to)
				})
				if err == nil {
					t.Fatal("expected failed switch")
				}
				retained, err := os.ReadFile(filepath.Join(data, recovery.journal.Directory, "previous", "new-only.txt"))
				if err != nil || string(retained) != "keep-after-interruption" {
					t.Fatalf("displaced data lost: %q %v", retained, err)
				}
			} else if stage == "installed" {
				if err := recovery.install(); err != nil {
					t.Fatal(err)
				}
			} else if err := recovery.record(stage); err != nil {
				t.Fatal(err)
			}
			restarted, err := NewManager(manager.config)
			if err != nil {
				t.Fatal(err)
			}
			if restarted.Snapshot().Operation.Phase != PhaseManualIntervention {
				t.Fatal("restart lost recovery block")
			}
			// Even overwriting the presentation state cannot remove the durable guard.
			restarted.state.Operation.Phase = PhaseIdle
			if _, err := restarted.Check(context.Background()); err == nil {
				t.Fatal("check bypassed unfinished recovery")
			}
			restarted.state.LatestRelease = &Release{Version: "v1.2.0"}
			if _, err := restarted.StartUpdate("v1.2.0"); err == nil {
				t.Fatal("upgrade bypassed unfinished recovery")
			}
			restarted.state.LastBackup = &backup
			restarted.state.RollbackVersion = backup.Version
			if _, err := restarted.StartRollback("retry"); err == nil {
				t.Fatal("rollback bypassed unfinished recovery")
			}
		})
	}
}

func TestDataRecoveryFailsBeforeDatabaseOrRestart(t *testing.T) {
	for _, command := range []string{"dropdb", "createdb", "pg_restore", "up"} {
		t.Run(command, func(t *testing.T) {
			manager, _ := localDataManager(t)
			backup := regularDataFixture(t, manager)
			if err := manager.savePreviousDeployment(); err != nil {
				t.Fatal(err)
			}
			t.Setenv("HOSTUPDATE_FIXTURE_FAIL", command)
			manager.runRollback("v1.1.0", backup, true)
			if manager.state.Operation.Phase != PhaseManualIntervention {
				t.Fatalf("phase=%s", manager.state.Operation.Phase)
			}
			if manager.pendingDataRecovery() == nil {
				t.Fatal("failed restore did not retain recovery lock")
			}
			body, _ := os.ReadFile(filepath.Join(manager.config.InstallDir, "bin", "calls.log"))
			calls := string(body)
			if command != "up" && strings.Contains(calls, " up ") {
				t.Fatal("application started after incomplete database restore")
			}
			if command == "up" && !strings.HasSuffix(strings.TrimSpace(calls), "stop web backend yingce-agent") {
				t.Fatal("partial startup was not stopped")
			}
		})
	}
}

func TestDataRootRejectsUnverifiableMounts(t *testing.T) {
	for _, scenario := range []string{"remote", "wrong-project", "readonly", "nested", "changed-source", "changed-type", "changed-volume", "transient-volume", "changed-directory", "protected-state", "root"} {
		t.Run(scenario, func(t *testing.T) {
			manager, data := localDataManager(t)
			if err := manager.savePreviousDeployment(); err != nil {
				t.Fatal(err)
			}
			bin := filepath.Join(manager.config.InstallDir, "bin")
			var containers []map[string]any
			body, _ := os.ReadFile(filepath.Join(bin, "inspect.json"))
			if err := json.Unmarshal(body, &containers); err != nil {
				t.Fatal(err)
			}
			mounts := containers[0]["Mounts"].([]any)
			mount := mounts[0].(map[string]any)
			var config map[string]any
			body, _ = os.ReadFile(filepath.Join(bin, "config.json"))
			if err := json.Unmarshal(body, &config); err != nil {
				t.Fatal(err)
			}
			backend := config["services"].(map[string]any)["backend"].(map[string]any)
			definition := backend["volumes"].([]any)[0].(map[string]any)
			switch scenario {
			case "remote":
				t.Setenv("DOCKER_HOST", "ssh://fixture.invalid")
			case "wrong-project":
				containers[0]["Config"].(map[string]any)["Labels"].(map[string]any)["com.docker.compose.project"] = "another-project"
			case "readonly":
				mount["RW"] = false
			case "nested":
				containers[0]["Mounts"] = append(mounts, map[string]any{"Type": "bind", "Source": data, "Destination": "/data/resources"})
			case "changed-source":
				definition["source"] = "/other"
			case "changed-type":
				definition["type"] = "volume"
			case "changed-volume":
				mount["Type"] = "volume"
				mount["Name"] = "original"
				definition["type"] = "volume"
				definition["source"] = "different"
				config["volumes"] = map[string]any{"different": map[string]any{"name": "different"}}
			case "transient-volume":
				mount["Type"] = "volume"
				mount["Name"] = "fixture-data"
				definition["type"] = "volume"
				definition["source"] = "fixture-data"
				config["volumes"] = map[string]any{"fixture-data": map[string]any{"name": "fixture-data"}}
				volume, _ := json.Marshal([]map[string]any{{"Name": "fixture-data", "Driver": "local", "Mountpoint": data, "Options": map[string]string{"type": "none", "o": "bind", "device": "/transient-mount"}}})
				if err := os.WriteFile(filepath.Join(bin, "volume.json"), volume, 0600); err != nil {
					t.Fatal(err)
				}
			case "changed-directory":
				backend["environment"] = map[string]string{"CANVAS_BACKEND_DATA_DIR": "/other"}
			case "protected-state":
				mount["Source"] = manager.config.InstallDir
				definition["source"] = manager.config.InstallDir
			case "root":
				mount["Source"] = "/"
				definition["source"] = "/"
			}
			body, _ = json.Marshal(containers)
			if err := os.WriteFile(filepath.Join(bin, "inspect.json"), body, 0600); err != nil {
				t.Fatal(err)
			}
			body, _ = json.Marshal(config)
			if err := os.WriteFile(filepath.Join(bin, "config.json"), body, 0600); err != nil {
				t.Fatal(err)
			}
			if source, err := manager.localDataRoot("v1.1.0"); err == nil {
				t.Fatalf("unsafe mount accepted: %s", source)
			}
		})
	}
}

func TestDataRecoveryProcessExitDuringSwitch(t *testing.T) {
	if body := os.Getenv("HOSTUPDATE_RECOVERY_CHILD"); body != "" {
		var fixture struct {
			Config Config
			Backup Backup
		}
		if err := json.Unmarshal([]byte(body), &fixture); err != nil {
			t.Fatal(err)
		}
		manager, err := NewManager(fixture.Config)
		if err != nil {
			t.Fatal(err)
		}
		recovery, err := manager.stageLocalData("v1.1.0", fixture.Backup)
		if err != nil {
			t.Fatal(err)
		}
		_ = recovery.installWithRename(func(from, to string) error {
			if err := recovery.root.Rename(from, to); err != nil {
				return err
			}
			os.Exit(23)
			return nil
		})
		t.Fatal("child did not exit during switch")
	}
	manager, data := localDataManager(t)
	backup := regularDataFixture(t, manager)
	if err := manager.savePreviousDeployment(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(data, "new-only.txt"), []byte("process-exit-preserve"), 0600); err != nil {
		t.Fatal(err)
	}
	body, _ := json.Marshal(struct {
		Config Config
		Backup Backup
	}{manager.config, backup})
	child := exec.Command(os.Args[0], "-test.run=^TestDataRecoveryProcessExitDuringSwitch$")
	child.Env = append(os.Environ(), "HOSTUPDATE_RECOVERY_CHILD="+string(body))
	out, err := child.CombinedOutput()
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 23 {
		t.Fatalf("expected interrupted child, got %v %s", err, out)
	}
	restarted, err := NewManager(manager.config)
	if err != nil {
		t.Fatal(err)
	}
	if restarted.Snapshot().Operation.Phase != PhaseManualIntervention || restarted.pendingDataRecovery() == nil {
		t.Fatal("process exit did not leave durable recovery guard")
	}
	copies, err := filepath.Glob(filepath.Join(data, recoveryPrefix+"*", "previous", "new-only.txt"))
	if err != nil || len(copies) != 1 {
		t.Fatal("process exit lost preserved data")
	}
	preserved, err := os.ReadFile(copies[0])
	if err != nil || string(preserved) != "process-exit-preserve" {
		t.Fatal("preserved data mismatch")
	}
	calls, _ := os.ReadFile(filepath.Join(manager.config.InstallDir, "bin", "calls.log"))
	if strings.Contains(string(calls), " up ") {
		t.Fatal("interrupted restore started services")
	}
}
