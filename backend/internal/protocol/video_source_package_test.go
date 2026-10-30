package protocol

import (
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

// Rebuilding a shipped video protocol must preserve its version and wire contract.
func TestVideoProtocolSourcesMatchShippedContracts(t *testing.T) {
	for _, id := range []string{"dashscope-wan3-video", "newapi-video-generations-v1"} {
		t.Run(id, func(t *testing.T) {
			root := filepath.Join("..", "..", "..", "plugin-packages")
			source, err := os.ReadFile(filepath.Join(root, id, "manifest.json"))
			if err != nil {
				t.Fatal(err)
			}
			data, err := os.ReadFile(filepath.Join(root, id+".yingce-plugin"))
			if err != nil {
				t.Fatal(err)
			}
			pkg, err := ParsePluginPackage(data)
			if err != nil {
				t.Fatal(err)
			}
			var fromSource, fromPackage map[string]any
			if err := json.Unmarshal(source, &fromSource); err != nil {
				t.Fatal(err)
			}
			if err := json.Unmarshal(pkg.ManifestRaw, &fromPackage); err != nil {
				t.Fatal(err)
			}
			delete(fromSource, "documentation")
			delete(fromPackage, "documentation")
			if !reflect.DeepEqual(fromSource, fromPackage) {
				t.Fatal("source version or wire contract differs from the shipped package; rebuilding would change runtime behavior")
			}
			interfaceDocs, err := os.ReadFile(filepath.Join(root, id, "docs", "interface.md"))
			if err != nil {
				t.Fatal(err)
			}
			assertManifestContractMatchesPackage(t, id, source, string(interfaceDocs))
		})
	}
}
