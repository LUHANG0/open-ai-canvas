package database

import (
	"fmt"
	"net/url"
	"strings"
)

func configureSQLiteDSN(dsn string) (string, error) {
	path, query, _ := strings.Cut(dsn, "?")
	params, err := url.ParseQuery(query)
	if err != nil {
		return "", fmt.Errorf("invalid SQLite connection parameters: %w", err)
	}
	if params.Get("_txlock") != "" {
		return dsn, nil
	}
	// Admission and worker claims read before writing. Deferred transactions
	// cannot upgrade a WAL snapshot after another writer commits (BUSY_SNAPSHOT),
	// even with busy_timeout. Acquire write intent before taking the snapshot;
	// competing writers can then wait at BEGIN instead. Explicit DSN choices win.
	params.Set("_txlock", "immediate")
	return path + "?" + params.Encode(), nil
}
