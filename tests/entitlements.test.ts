import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasProAccess, isActiveEntitlement, normalizeEntitlement, type Entitlement } from '../src/entitlements'

const entitlement = (overrides: Partial<Entitlement> = {}): Entitlement => ({
  productId: 'doneday-pro',
  status: 'active',
  source: 'google_play',
  startsAt: '2026-10-01T00:00:00.000Z',
  endsAt: '2026-11-01T00:00:00.000Z',
  graceEndsAt: null,
  willRenew: true,
  updatedAt: '2026-10-01T00:00:00.000Z',
  ...overrides,
})

describe('Pro entitlement foundation', () => {
  it('keeps existing features in the free state unless a valid active projection exists', () => {
    const now = new Date('2026-10-15T00:00:00.000Z')
    expect(hasProAccess([], now)).toBe(false)
    expect(hasProAccess([entitlement({ productId: 'another-product' })], now)).toBe(false)
    expect(hasProAccess([entitlement()], now)).toBe(true)
  })

  it('handles grace, expiry, revocation, and malformed entitlement rows safely', () => {
    const now = new Date('2026-10-15T00:00:00.000Z')
    expect(isActiveEntitlement(entitlement({ status: 'grace', endsAt: '2026-10-10T00:00:00.000Z', graceEndsAt: '2026-10-20T00:00:00.000Z' }), now)).toBe(true)
    expect(isActiveEntitlement(entitlement({ status: 'expired', endsAt: '2026-11-01T00:00:00.000Z' }), now)).toBe(false)
    expect(isActiveEntitlement(entitlement({ status: 'revoked' }), now)).toBe(false)
    expect(normalizeEntitlement({ product_id: 'doneday-pro', status: 'active', source: 'google_play', starts_at: null, ends_at: null, grace_ends_at: null, will_renew: true, updated_at: 'bad-date' })).toBeNull()
  })

  it('keeps writes server-only and limits the browser to its own entitlement projection', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202610260001_entitlements_foundation.sql'), 'utf8')
    expect(migration).toContain('alter table public.entitlements enable row level security;')
    expect(migration).toMatch(/create policy "entitlements readable by owner"[\s\S]*using \(user_id = auth\.uid\(\)\)/)
    expect(migration).toMatch(/revoke all on table[\s\S]*public\.entitlements[\s\S]*from anon, authenticated;/)
    expect(migration).toMatch(/grant select on table public\.entitlements to authenticated;/)
    expect(migration).not.toMatch(/grant (?:all|insert|update|delete) on table public\.entitlements to authenticated;/)
    expect(migration).toContain('unique (provider, provider_event_id)')
  })
})

