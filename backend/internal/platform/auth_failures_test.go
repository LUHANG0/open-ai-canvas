package platform

import (
	"context"
	"github.com/redis/go-redis/v9"
	"os"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestAuthFailuresAtomicFixedWindowAndClear(t *testing.T) {
	c := &Coordinator{localRate: map[string]localRateEntry{}}
	ctx := context.Background()
	var wg sync.WaitGroup
	for range 50 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := c.AuthFailures(ctx, "account", "add"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if n, err := c.AuthFailures(ctx, "account", "read"); err != nil || n != 50 {
		t.Fatalf("count %d %v", n, err)
	}
	c.localMu.Lock()
	entry := c.localRate["auth-failure:account"]
	entry.started = time.Now().Add(-9 * time.Minute)
	c.localRate["auth-failure:account"] = entry
	c.localMu.Unlock()
	if _, err := c.AuthFailures(ctx, "account", "add"); err != nil {
		t.Fatal(err)
	}
	if c.localRate["auth-failure:account"].started != entry.started {
		t.Fatal("failed attempt extended window")
	}
	entry.started = time.Now().Add(-11 * time.Minute)
	c.localRate["auth-failure:account"] = entry
	if n, _ := c.AuthFailures(ctx, "account", "read"); n != 0 {
		t.Fatal("expired count retained")
	}
	_, _ = c.AuthFailures(ctx, "account", "add")
	_, _ = c.AuthFailures(ctx, "account", "clear")
	if n, _ := c.AuthFailures(ctx, "account", "read"); n != 0 {
		t.Fatal("clear failed")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := c.AuthFailures(cancelled, "account", "add"); err == nil {
		t.Fatal("cancel ignored")
	}
}

// This integration target must point to the disposable Redis started for this test.
// It deliberately does not read deployment REDIS_URL.
func TestAuthFailuresRedisSharedWindow(t *testing.T) {
	target := os.Getenv("TURNSTILE_TEST_REDIS_URL")
	if target == "" {
		t.Skip("disposable Redis target not provided")
	}
	if !strings.HasPrefix(target, "redis://127.0.0.1:16379") {
		t.Fatal("expected disposable local Redis on port 16379")
	}
	options, err := redis.ParseURL(target)
	if err != nil {
		t.Fatal(err)
	}
	options.MaxRetries = -1
	client := redis.NewClient(options)
	t.Cleanup(func() { _ = client.Close() })
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		t.Fatal(err)
	}
	first := NewCoordinatorWithRedis(client, "instance-a")
	second := NewCoordinatorWithRedis(client, "instance-b")
	key := "turnstile-isolated-counter"
	redisKey := "canvas:auth-failures:" + key
	t.Cleanup(func() { _ = client.Del(context.Background(), redisKey).Err() })
	_, _ = first.AuthFailures(ctx, key, "clear")
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			c := first
			if i%2 == 0 {
				c = second
			}
			if _, err := c.AuthFailures(ctx, key, "add"); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	if n, err := second.AuthFailures(ctx, key, "read"); err != nil || n != 50 {
		t.Fatalf("shared count %d %v", n, err)
	}
	if err := client.PExpire(ctx, redisKey, time.Minute).Err(); err != nil {
		t.Fatal(err)
	}
	_, _ = first.AuthFailures(ctx, key, "add")
	if ttl := client.PTTL(ctx, redisKey).Val(); ttl > time.Minute || ttl < 50*time.Second {
		t.Fatalf("window extended: %s", ttl)
	}
	if err := client.PExpire(ctx, redisKey, time.Millisecond).Err(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)
	if n, _ := second.AuthFailures(ctx, key, "read"); n != 0 {
		t.Fatal("expired Redis count retained")
	}
	_, _ = first.AuthFailures(ctx, key, "add")
	_, _ = second.AuthFailures(ctx, key, "clear")
	if n, _ := first.AuthFailures(ctx, key, "read"); n != 0 {
		t.Fatal("shared clear failed")
	}
}
