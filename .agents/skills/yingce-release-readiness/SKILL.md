---
name: yingce-release-readiness
description: Use when preparing a Yingce release, deployment, migration, or cross-module acceptance run. Inspect the actual target environment, build inputs, data dependencies, and verification evidence before claiming a version is ready.
---

# Release Readiness

Apply this skill to a concrete release or deployment request. It does not authorize a push, production write, migration, or cleanup by itself.

## Establish The Candidate

1. Identify the exact source revision and working-tree changes being proposed. Separate the candidate from unrelated uncommitted files, generated assets, and local evidence.
2. Read the target environment's actual Compose overlay, image/source version, `.env` values without exposing secrets, mounted data, proxy, and health state. Local and hosted environments may differ.
3. Map changed contracts to required components: Web, Backend, Agent runtime, migrations, plugins, media assets, and public/CMS content. A frontend-only build is not evidence for a backend protocol change.
4. For schema changes, inspect `backend/internal/database/migrations.go`, model/repository changes, SQLite and PostgreSQL upgrade coverage, backup/restore readiness, and old-binary compatibility. Do not infer the running schema from source constants.

## Verify The User Path

- Start with focused tests, then run the relevant quality gates from `.github/workflows/quality.yml` with their real dependencies. A skipped PostgreSQL or Redis test is not a passing integration test.
- Check the changed user path in a real browser, including authentication, permissions, mobile layout, saving/readback, and failure recovery as applicable. For SSE or WebSocket changes, check disconnect/replay behavior.
- For money, paid generation, messages, external storage, or account creation, use isolated test inputs unless the user has authorized real effects.
- After an authorized deployment, compare the running revision and assets to the candidate, verify readiness and the affected workflow, and record any untested external behavior. Health alone does not prove a feature works.

Keep release evidence tied to this candidate and environment. Do not reuse an older passing run as proof for newer source.
