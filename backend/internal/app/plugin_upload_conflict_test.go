package app

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestPluginUploadExistingSystemProtocolReturnsReadableConflict(t *testing.T) {
	center, err := newPluginRuntime(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"drama-api", "4stoken", "yezonghui"} {
		t.Run(id, func(t *testing.T) {
			data, err := os.ReadFile(filepath.Join("..", "..", "..", "plugin-packages", id+".yingce-plugin"))
			if err != nil {
				t.Fatal(err)
			}
			before := center.list()
			registryBefore, err := os.ReadFile(center.registryPath)
			if err != nil {
				t.Fatal(err)
			}
			_, err = center.install(data, id+".yingce-plugin")
			var appErr *AppError
			if !errors.As(err, &appErr) || appErr.Status != CodeConflict || appErr.Reason != ReasonConflict || !strings.Contains(appErr.Message, "已作为系统插件加载") || !strings.Contains(appErr.Message, "渠道模型") {
				t.Fatalf("upload error = %#v", err)
			}
			registryAfter, err := os.ReadFile(center.registryPath)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(before, center.list()) || string(registryBefore) != string(registryAfter) {
				t.Fatal("rejected upload modified the installed system plugin")
			}
		})
	}
}
