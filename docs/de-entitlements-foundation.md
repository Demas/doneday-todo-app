# DoneDay Pro and payments foundation

This branch adds a database foundation for future paid access. It does **not** add a checkout, subscription screen, purchase button, payment SDK, store product, or feature gate. DoneDay remains fully usable in guest and signed-in modes.

## Included contract

The unapplied migration **supabase/migrations/202610260001_entitlements_foundation.sql** adds:

| Object | Purpose |
| --- | --- |
| billing_customers | Non-secret provider customer references mapped to a DoneDay account. |
| billing_events | Idempotent, verified provider event history keyed by provider event ID. |
| entitlements | Current plan projection that authenticated users may read for their own account. |
| entitlement_audit | Server-maintained entitlement changes for support and incident review. |
| usage_counters | Future server-maintained metering for any costed feature. |

The browser can only read its own entitlement rows. It has no insert, update, or delete permissions on any billing or entitlement table. A future trusted server verifier must validate Google Play purchases, Apple signed transactions, or a compliant web provider webhook before it writes the projection. Purchase tokens, signed transactions, VAPID keys, service-role keys, and payment credentials must never be stored in frontend code or this schema.

**src/entitlements.ts** is a read-only client contract. An unavailable entitlement record is treated as Free. It does not remove user data or disable existing DoneDay functionality.

## Before charging users

1. Create separate Google Play and App Store products after the legal entity, tax, banking, refund, support, and privacy requirements are approved.
2. Implement server-side receipt/signature verification and authenticated webhook endpoints that write immutable billing_events, then update entitlements and entitlement_audit atomically.
3. Add restore-purchases, cancellation, grace, expiry, refund, and revocation flows.
4. Enforce any costly server feature from the verified entitlement; client UI alone is not a payment control.
5. Use sandbox accounts to test purchase, renewal, cancellation, refund, restore, account deletion, offline reads, and account changes on real Android and iOS devices.
6. Review current Google Play Billing, Apple In-App Purchase, tax, consumer-law, and privacy obligations before release.

## Deployment state

The migration is **not applied** by this branch. Do not run **supabase db push** until a reviewed server verifier and store/provider configuration exist. No Vercel or Supabase deployment is part of this phase.

