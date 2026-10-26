---
name: yingce-identity-billing
description: Use for Yingce login, registration, invitations, account switching, permissions, wallet, pricing, payments, generation charging, refunds, and reconciliation. Follow server-side authority and transaction identities through success, retry, and failure.
---

# Identity And Billing

Apply this skill to account or money changes. Start with `backend/internal/auth/`, `backend/internal/app/finance*.go`, `payment*.go`, `task_billing.go`, repositories, and the matching web auth/admin/wallet API. Read actual policy and tests before changing user-visible controls.

## Identity

- Trace session identity, target user, role, feature gate, and object ownership at the backend execution point. Check logout and account switching against cached data and pending writes.
- Registration paths differ: initial administrator, public registration, invitation, third-party login, and recovery. Preserve the relevant verification, consent, one-time token/invitation consumption, reward, and audit boundaries.
- Keep redirects limited to validated internal destinations; do not expose tokens, invite codes, or credential-bearing URLs in logs or public errors.

## Money

- Identify the exact unit and meaning of each amount: configured price, preauthorization, settled charge, refund, balance, and displayed estimate. Keep integer precision and explicitly distinguish zero from unknown.
- For a paid operation, trace the order/task/provider request identities and transaction boundary. A timeout or lost response may be uncertain rather than failed; check reconciliation before retrying or refunding.
- Verify idempotency for duplicate callbacks, retries, cancellation, and concurrent requests. An authorization failure must not leave a created account, spent invite, or changed balance behind.
- Keep administrator actions and payment plugin calls behind their real permission and signed callback checks; a disabled button is not an authorization guard.

## Verify

Use isolated accounts, SQLite/PostgreSQL test databases as relevant, and fake external providers. Cover success plus duplicate, failed, concurrent, and uncertain outcomes for the changed contract. Real charges, messages, account creation, and production reconciliation require authorization for those effects.
