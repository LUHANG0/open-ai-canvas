package updaterclient

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"path/filepath"
	"reflect"
	"testing"

	"yingce/backend/internal/hostupdate"
)

func TestClientPreservesIndependentCustomComponentVersions(t *testing.T) {
	socket := filepath.Join(t.TempDir(), "updater.sock")
	listener, err := net.Listen("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	current := map[string]hostupdate.CustomComponent{
		"web":          {Version: "web-current", Commit: "web-commit", Image: "web-image"},
		"backend":      {Version: "backend-current", Commit: "backend-commit", Image: "backend-image"},
		"yingce-agent": {Version: "agent-current", Commit: "agent-commit", Image: "agent-image"},
	}
	candidate := map[string]hostupdate.CustomComponent{
		"web":          {Version: "web-next", Commit: "next-web-commit", Image: "next-web-image"},
		"backend":      current["backend"],
		"yingce-agent": current["yingce-agent"],
	}
	server := &http.Server{Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-updater-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/v1/status" && r.URL.Path != "/v1/check" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
			return
		}
		_ = json.NewEncoder(w).Encode(hostupdate.Status{
			Supported: true, Connected: true, Repository: "LUHANG0/open-ai-canvas",
			Deployment: "custom-compose-host-updater", CurrentVersion: "current",
			Components: current, LatestRelease: &hostupdate.Release{Version: "candidate", Components: candidate},
		})
	})}
	go func() { _ = server.Serve(listener) }()
	t.Cleanup(func() { _ = server.Close() })
	client := New(socket, "test-updater-token")
	for _, read := range []struct {
		name string
		call func(context.Context) (hostupdate.Status, error)
	}{{"status", client.Status}, {"check", client.Check}} {
		t.Run(read.name, func(t *testing.T) {
			status, err := read.call(context.Background())
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(status.Components, current) || status.LatestRelease == nil || !reflect.DeepEqual(status.LatestRelease.Components, candidate) {
				t.Fatalf("component versions were lost or mixed between current and candidate: %#v", status)
			}
			if status.Repository != "LUHANG0/open-ai-canvas" || status.Deployment != "custom-compose-host-updater" {
				t.Fatalf("custom deployment identity was lost: %#v", status)
			}
		})
	}
	if _, err := New(socket, "wrong-token").Status(context.Background()); err == nil {
		t.Fatal("updater client accepted a credential rejection")
	}
}
