package repository

import (
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
	"path/filepath"
	"sync"
	"testing"
	"yingce/backend/internal/model"
)

func TestBrandSiteCASAcrossRepositories(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "brand.db")), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := db.DB()
	raw.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = raw.Close() })
	if err = db.AutoMigrate(&model.SystemSetting{}); err != nil {
		t.Fatal(err)
	}
	first, second := New(db), New(db)
	a := &model.SystemSetting{Key: "brand_site", ValueJSON: `{"revision":1}`}
	if ok, err := first.CompareAndSwapSystemSetting(a, nil); err != nil || !ok {
		t.Fatal(ok, err)
	}
	if ok, err := second.CompareAndSwapSystemSetting(&model.SystemSetting{Key: a.Key, ValueJSON: `{"revision":9}`}, nil); err != nil || ok {
		t.Fatal("initial create overwritten", ok, err)
	}
	previous, err := first.SystemSetting(a.Key)
	if err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	wins := make(chan bool, 2)
	errs := make(chan error, 2)
	for i, r := range []*Repository{first, second} {
		wg.Add(1)
		go func(i int, r *Repository) {
			defer wg.Done()
			next := &model.SystemSetting{Key: a.Key, ValueJSON: []string{`{"revision":2,"winner":"first"}`, `{"revision":2,"winner":"second"}`}[i]}
			ok, e := r.CompareAndSwapSystemSetting(next, previous)
			wins <- ok
			errs <- e
		}(i, r)
	}
	wg.Wait()
	close(wins)
	close(errs)
	count := 0
	for ok := range wins {
		if ok {
			count++
		}
	}
	for e := range errs {
		if e != nil {
			t.Fatal(e)
		}
	}
	if count != 1 {
		t.Fatalf("want one winner, got %d", count)
	}
}
