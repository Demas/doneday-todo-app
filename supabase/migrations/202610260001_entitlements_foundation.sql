-- DoneDay Phase D/E: server-authoritative entitlement foundation.
-- This migration intentionally does not enable checkout, subscriptions, or client-side writes.
-- Apply only after reviewed provider verification/webhook services are ready.

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_play', 'apple_app_store', 'web')),
  customer_reference text not null check (char_length(customer_reference) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, customer_reference),
  unique (user_id, provider)
);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google_play', 'apple_app_store', 'web')),
  provider_event_id text not null check (char_length(provider_event_id) between 1 and 255),
  event_type text not null check (event_type in ('purchase', 'renewal', 'cancellation', 'grace', 'recovery', 'refund', 'revocation', 'expiration')),
  product_id text not null check (char_length(product_id) between 1 and 100),
  occurred_at timestamptz not null,
  reference_hash text not null check (char_length(reference_hash) between 32 and 255),
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table if not exists public.entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (char_length(product_id) between 1 and 100),
  status text not null check (status in ('active', 'grace', 'expired', 'revoked')),
  source text not null check (source in ('google_play', 'apple_app_store', 'web', 'support')),
  starts_at timestamptz,
  ends_at timestamptz,
  grace_ends_at timestamptz,
  will_renew boolean not null default false,
  verified_event_id uuid references public.billing_events(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  unique (user_id, product_id)
);

create table if not exists public.entitlement_audit (
  id uuid primary key default gen_random_uuid(),
  entitlement_id uuid not null references public.entitlements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null check (char_length(product_id) between 1 and 100),
  event_type text not null check (event_type in ('grant', 'renew', 'grace', 'expire', 'revoke', 'restore', 'support_adjustment')),
  previous_status text check (previous_status in ('active', 'grace', 'expired', 'revoked')),
  next_status text not null check (next_status in ('active', 'grace', 'expired', 'revoked')),
  verified_event_id uuid references public.billing_events(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  counter_key text not null check (char_length(counter_key) between 1 and 100),
  period_starts_at timestamptz not null,
  count integer not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, counter_key, period_starts_at)
);

create index if not exists billing_events_user_occurred_at on public.billing_events(user_id, occurred_at desc);
create index if not exists entitlements_user_status on public.entitlements(user_id, status);
create index if not exists entitlement_audit_entitlement_created_at on public.entitlement_audit(entitlement_id, created_at desc);

alter table public.billing_customers enable row level security;
alter table public.billing_events enable row level security;
alter table public.entitlements enable row level security;
alter table public.entitlement_audit enable row level security;
alter table public.usage_counters enable row level security;

-- An account may read only its present entitlement projection. Store events,
-- audit records, provider customer references, and usage counters are not client-readable.
drop policy if exists "entitlements readable by owner" on public.entitlements;
create policy "entitlements readable by owner"
on public.entitlements for select
to authenticated
using (user_id = auth.uid());

revoke all on table
  public.billing_customers,
  public.billing_events,
  public.entitlements,
  public.entitlement_audit,
  public.usage_counters
from anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.entitlements to authenticated;

-- A trusted server verifier/webhook worker uses the Supabase service role. It must
-- validate store receipts/signatures before writing these records and must store
-- only a hash/reference, never a purchase token or signed transaction payload.
grant all on table
  public.billing_customers,
  public.billing_events,
  public.entitlements,
  public.entitlement_audit,
  public.usage_counters
to service_role;

