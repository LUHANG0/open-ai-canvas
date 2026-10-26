package platform

import (
	"context"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

// AuthFailures uses the existing coordinator so PostgreSQL instances share
// failure counts. SQLite's single process keeps the same fixed-window behavior.
func (c *Coordinator) AuthFailures(ctx context.Context, key, operation string) (int, error) {
	if err := ctx.Err(); err != nil {
		return 0, err
	}
	if c == nil {
		return 0, errors.New("运行时协调器未初始化")
	}
	if operation != "read" && operation != "add" && operation != "clear" {
		return 0, errors.New("失败计数操作无效")
	}
	const window = 10 * time.Minute
	if c.redis != nil {
		key = "canvas:auth-failures:" + key
		if operation == "clear" {
			return 0, c.redis.Del(ctx, key).Err()
		}
		// Keep the original expiry instead of extending it on every failed login.
		if operation == "add" {
			return authFailureCounterScript.Run(ctx, c.redis, []string{key}, window.Milliseconds()).Int()
		}
		count, err := c.redis.Get(ctx, key).Int()
		if err == redis.Nil {
			return 0, nil
		}
		return count, err
	}
	c.localMu.Lock()
	defer c.localMu.Unlock()
	if c.localRate == nil {
		c.localRate = map[string]localRateEntry{}
	}
	key = "auth-failure:" + key
	now := time.Now()
	entry := c.localRate[key]
	if operation == "clear" || (!entry.started.IsZero() && now.Sub(entry.started) >= window) {
		delete(c.localRate, key)
		entry = localRateEntry{}
	}
	if operation == "add" {
		if entry.started.IsZero() {
			entry.started = now
		}
		entry.count = min(entry.count+1, 1000)
		c.localRate[key] = entry
		if len(c.localRate) > 8192 {
			for oldKey, old := range c.localRate {
				if len(oldKey) >= 13 && oldKey[:13] == "auth-failure:" && now.Sub(old.started) >= window {
					delete(c.localRate, oldKey)
				}
			}
		}
	}
	return entry.count, nil
}

var authFailureCounterScript = redis.NewScript(`
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= 1000 then return count end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`)
