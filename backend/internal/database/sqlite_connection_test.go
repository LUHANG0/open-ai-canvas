package database

import (
	"net/url"
	"strings"
	"testing"
)

func TestSQLiteConnectionDefaultsPreserveDSNOptions(t *testing.T) {
	for _, dsn := range []string{
		":memory:",
		"file:shared?mode=memory&cache=shared",
		"/tmp/test.db?_busy_timeout=1234&_journal_mode=WAL&_foreign_keys=on",
		"file:test.db?_txlock=&_busy_timeout=250",
	} {
		t.Run(dsn, func(t *testing.T) {
			got, err := configureSQLiteDSN(dsn)
			if err != nil {
				t.Fatal(err)
			}
			beforePath, beforeQuery, _ := strings.Cut(dsn, "?")
			afterPath, afterQuery, _ := strings.Cut(got, "?")
			before, _ := url.ParseQuery(beforeQuery)
			after, _ := url.ParseQuery(afterQuery)
			if beforePath != afterPath || after.Get("_txlock") != "immediate" {
				t.Fatalf("unexpected DSN: %s", got)
			}
			for key := range before {
				if key != "_txlock" && before.Get(key) != after.Get(key) {
					t.Fatalf("option %s changed: %s", key, got)
				}
			}
		})
	}
	for _, mode := range []string{"deferred", "immediate", "exclusive", "%64eferred"} {
		dsn := "file:test.db?_txlock=" + mode + "&_busy_timeout=1000"
		got, err := configureSQLiteDSN(dsn)
		if err != nil || got != dsn {
			t.Fatalf("explicit mode changed: %s, %v", got, err)
		}
	}
	if _, err := configureSQLiteDSN("file:test.db?_txlock=%zz"); err == nil {
		t.Fatal("invalid connection parameters accepted")
	}
}
