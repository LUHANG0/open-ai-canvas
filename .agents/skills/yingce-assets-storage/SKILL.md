---
name: yingce-assets-storage
description: Use for Yingce uploads, creator assets, resource references, storage backends, signed media access, quotas, deletion, trash, migration, or cleanup. Trace logical asset records and physical bytes separately across accounts and consumers.
---

# Assets And Storage

Use this when an asset or media file is created, moved, read, linked, replaced, deleted, or migrated. Start with `web/src/pages/assets/`, `web/src/services/api/resources.ts`, `backend/internal/app/resource*.go`, `storage*.go`, and the relevant repositories.

## Track Both Identities

- Distinguish creator asset/version records, resource IDs, physical storage objects, signed access URLs, and references from canvas, project, task, or CMS. A new URL for the same object should not appear as a new result.
- For upload, trace reservation/quota, type and size checks, bytes reaching storage, ready status, record creation, failure cleanup, and readback. Check account ownership before issuing access to private media.
- For copies or derived media, identify which records share the physical object before deleting or replacing one reference.

## Preserve Deletion Semantics

- Ordinary deletion, user-confirmed purge, and orphan cleanup have different rules in `backend/internal/app/resource_delete.go`; inspect the exact path instead of applying one rule everywhere.
- Keep business record changes and outbox work in the intended transaction; physical deletion happens after commit and must be retryable. Protect objects still reused by other assets.
- Check stale canvas/project/task references, pending uploads, and concurrent generation callbacks before changing cleanup or retention behavior.
- For storage migration, verify source and destination bytes, access policy, encryption keys, rollback/read compatibility, and live writer coordination before removing an old location.

## Verify

Use isolated storage and database fixtures for upload, access denial, shared-object references, deletion modes, retry, and migration cases. Exercise the affected browser readback or picker when UI behavior changes. Do not use production buckets or user media for a test without authorization.
