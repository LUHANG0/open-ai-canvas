package hostupdate

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fixtureCustomRelease(id string) CustomRelease {
	r := CustomRelease{Format: 1, ID: id, Components: map[string]CustomComponent{}}
	for i, name := range []string{"backend", "web", "yingce-agent"} {
		r.Components[name] = CustomComponent{Image: "sha256:" + strings.Repeat(string(rune('a'+i)), 64), Version: "v1.6.9.1", Commit: strings.Repeat(string(rune('a'+i)), 40)}
	}
	return r
}

func writeCustomJSON(t *testing.T, path string, value any) {
	t.Helper()
	body, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, 0600); err != nil {
		t.Fatal(err)
	}
}

func TestCustomManifestRequiresIndependentImmutableComponents(t *testing.T) {
	for _, scenario := range []string{"valid", "tag", "missing-agent", "missing-commit", "unknown-service", "unsafe-id"} {
		t.Run(scenario, func(t *testing.T) {
			r := fixtureCustomRelease("release-20261031")
			switch scenario {
			case "tag":
				c := r.Components["web"]
				c.Image = "local/web:latest"
				r.Components["web"] = c
			case "missing-agent":
				delete(r.Components, "yingce-agent")
			case "missing-commit":
				c := r.Components["backend"]
				c.Commit = ""
				r.Components["backend"] = c
			case "unknown-service":
				r.Components["postgres"] = r.Components["backend"]
			case "unsafe-id":
				r.ID = "../release"
			}
			err := validateCustomRelease(r)
			if (err == nil) != (scenario == "valid") {
				t.Fatalf("validation = %v", err)
			}
		})
	}
}

func TestCustomProfileDoesNotAcceptRelativeOrMutableDeploymentPaths(t *testing.T) {
	root := t.TempDir()
	profile := CustomProfile{Format: 1, ProjectName: "mengceng", ProjectDirectory: root, ComposeFiles: []string{filepath.Join(root, "base.yml"), filepath.Join(root, "overlay.yml")}, EnvFile: filepath.Join(root, "shared.env"), CurrentRelease: filepath.Join(root, "current.json"), TargetRelease: filepath.Join(root, "target.json")}
	for _, scenario := range []string{"valid", "relative-overlay", "missing-project", "duplicate-overlay", "relative-hook", "missing-hook-hash"} {
		t.Run(scenario, func(t *testing.T) {
			p := profile
			p.ComposeFiles = append([]string(nil), profile.ComposeFiles...)
			switch scenario {
			case "relative-overlay":
				p.ComposeFiles[1] = "overlay.yml"
			case "missing-project":
				p.ProjectName = ""
			case "duplicate-overlay":
				p.ComposeFiles[1] = p.ComposeFiles[0]
			case "relative-hook":
				p.WebPublisher = "publish.sh"
				p.WebPublisherSHA256 = strings.Repeat("a", 64)
			case "missing-hook-hash":
				p.WebPublisher = filepath.Join(root, "publish.sh")
			}
			if err := validateCustomProfile(p); (err == nil) != (scenario == "valid") {
				t.Fatalf("validation = %v", err)
			}
		})
	}
}

func TestCustomCheckUsesLocalManifestAndPinsCheckedContent(t *testing.T) {
	m, profile := customTestManager(t)
	status, err := m.Check(t.Context())
	if err != nil || !status.UpdateAvailable || status.CurrentVersion != "old" || status.LatestRelease.Version != "new" {
		t.Fatalf("status=%+v err=%v", status, err)
	}
	// The same displayed release ID cannot authorize different component bytes.
	r := fixtureCustomRelease("new")
	c := r.Components["web"]
	c.Image = "sha256:" + strings.Repeat("f", 64)
	r.Components["web"] = c
	writeCustomJSON(t, profile.TargetRelease, r)
	if _, err := m.StartUpdate("new"); err == nil {
		t.Fatal("accepted a changed candidate without another check")
	}
}

func customTestManager(t *testing.T) (*Manager, CustomProfile) {
	t.Helper()
	root := t.TempDir()
	p := CustomProfile{Format: 1, ProjectName: "mengceng-fixture", ProjectDirectory: root, ComposeFiles: []string{filepath.Join(root, "base.yml"), filepath.Join(root, "overlay.yml")}, EnvFile: filepath.Join(root, "shared.env"), CurrentRelease: filepath.Join(root, "old.json"), TargetRelease: filepath.Join(root, "target.json")}
	writeCustomJSON(t, p.CurrentRelease, fixtureCustomRelease("old"))
	r := fixtureCustomRelease("new")
	r.BasedOn = "old"
	c := r.Components["backend"]
	c.Image = "sha256:" + strings.Repeat("d", 64)
	r.Components["backend"] = c
	writeCustomJSON(t, p.TargetRelease, r)
	for _, path := range append(p.ComposeFiles, p.EnvFile) {
		if err := os.WriteFile(path, []byte("fixture\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	profilePath := filepath.Join(root, "profile.json")
	writeCustomJSON(t, profilePath, p)
	m, err := NewManager(Config{CustomProfile: profilePath, StateDir: filepath.Join(root, "state"), BackupDir: filepath.Join(root, "backups")})
	if err != nil {
		t.Fatal(err)
	}
	return m, p
}
