import { cloudConfigured, supabase } from './supabase'

export type EntitlementStatus = 'active' | 'grace' | 'expired' | 'revoked'
export type EntitlementSource = 'google_play' | 'apple_app_store' | 'web' | 'support'
export type Entitlement = {
  productId: string
  status: EntitlementStatus
  source: EntitlementSource
  startsAt: string | null
  endsAt: string | null
  graceEndsAt: string | null
  willRenew: boolean
  updatedAt: string
}

type EntitlementRow = {
  product_id: unknown
  status: unknown
  source: unknown
  starts_at: unknown
  ends_at: unknown
  grace_ends_at: unknown
  will_renew: unknown
  updated_at: unknown
}

const statuses = new Set<EntitlementStatus>(['active', 'grace', 'expired', 'revoked'])
const sources = new Set<EntitlementSource>(['google_play', 'apple_app_store', 'web', 'support'])
const safeDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null

export function normalizeEntitlement(row: EntitlementRow): Entitlement | null {
  const updatedAt = safeDate(row.updated_at)
  if (typeof row.product_id !== 'string' || !row.product_id || !statuses.has(row.status as EntitlementStatus) || !sources.has(row.source as EntitlementSource) || !updatedAt) return null
  return {
    productId: row.product_id,
    status: row.status as EntitlementStatus,
    source: row.source as EntitlementSource,
    startsAt: safeDate(row.starts_at),
    endsAt: safeDate(row.ends_at),
    graceEndsAt: safeDate(row.grace_ends_at),
    willRenew: row.will_renew === true,
    updatedAt,
  }
}

export function isActiveEntitlement(entitlement: Entitlement | null | undefined, now = new Date()): boolean {
  if (!entitlement || !['active', 'grace'].includes(entitlement.status)) return false
  const cutoff = entitlement.status === 'grace' ? entitlement.graceEndsAt ?? entitlement.endsAt : entitlement.endsAt
  return !cutoff || Date.parse(cutoff) > now.getTime()
}

export function hasProAccess(entitlements: Entitlement[], now = new Date()): boolean {
  return entitlements.some(entitlement => entitlement.productId === 'doneday-pro' && isActiveEntitlement(entitlement, now))
}

// This browser read is deliberately projection-only. No client code can grant,
// restore, or alter an entitlement; a verified server-side provider workflow will
// own those operations in the payment phase.
export async function loadEntitlements(userId: string): Promise<Entitlement[]> {
  if (!cloudConfigured || !supabase || !userId) return []
  const { data, error } = await supabase
    .from('entitlements')
    .select('product_id, status, source, starts_at, ends_at, grace_ends_at, will_renew, updated_at')
    .eq('user_id', userId)

  if (error) throw new Error('Could not read your plan status. Existing DoneDay features remain available.')
  return ((data ?? []) as EntitlementRow[]).map(normalizeEntitlement).filter((value): value is Entitlement => value !== null)
}

