-- DoneDay 3.0 cloud data model. Apply with: supabase db push
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.categories (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50), color text not null, data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tasks (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160), description text not null default '', due_date date, due_time time,
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')), category_id text,
  completed boolean not null default false, completed_at timestamptz, recurrence text not null default 'none', data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (category_id) references public.categories(id) on delete set null
);
create table if not exists public.subtasks (
  id text primary key, task_id text not null references public.tasks(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, completed boolean not null default false, position integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null check (char_length(name) between 1 and 40), unique(user_id, name)
);
create table if not exists public.task_tags (
  task_id text not null references public.tasks(id) on delete cascade, tag_id uuid not null references public.tags(id) on delete cascade, primary key(task_id, tag_id)
);
create table if not exists public.routines (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, title text not null, data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.birthdays (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, name text not null, month smallint not null check (month between 1 and 12), day smallint not null check (day between 1 and 31), year smallint, data jsonb not null default '{}'::jsonb,
  deleted_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.reminder_schedules (
  id text primary key, user_id uuid not null references auth.users(id) on delete cascade, task_id text references public.tasks(id) on delete cascade,
  birthday_id text references public.birthdays(id) on delete cascade, send_at timestamptz not null, payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','cancelled','failed')), attempts integer not null default 0, locked_at timestamptz, sent_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (num_nonnulls(task_id, birthday_id) = 1)
);
create table if not exists public.push_subscriptions (
  endpoint text primary key, user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh text not null, auth text not null, user_agent text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(), schedule_id text not null references public.reminder_schedules(id) on delete cascade,
  endpoint text, state text not null check (state in ('sent','failed','expired')), detail text, created_at timestamptz not null default now(), unique(schedule_id, endpoint)
);

create index if not exists tasks_owner_updated on public.tasks(user_id, updated_at desc) where deleted_at is null;
create index if not exists birthdays_owner_updated on public.birthdays(user_id, updated_at desc) where deleted_at is null;
create index if not exists schedules_due on public.reminder_schedules(send_at) where status = 'pending';

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', '')) on conflict (id) do nothing; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security; alter table public.categories enable row level security; alter table public.tasks enable row level security; alter table public.subtasks enable row level security; alter table public.tags enable row level security; alter table public.task_tags enable row level security; alter table public.routines enable row level security; alter table public.birthdays enable row level security; alter table public.user_settings enable row level security; alter table public.reminder_schedules enable row level security; alter table public.push_subscriptions enable row level security; alter table public.notification_deliveries enable row level security;

create policy "profiles owned" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "categories owned" on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks owned" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subtasks owned" on public.subtasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tags owned" on public.tags for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "task tags owned" on public.task_tags for all using (exists(select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid())) with check (exists(select 1 from public.tasks t where t.id = task_id and t.user_id = auth.uid()));
create policy "routines owned" on public.routines for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "birthdays owned" on public.birthdays for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings owned" on public.user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "schedules visible to owner" on public.reminder_schedules for select using (user_id = auth.uid());
create policy "subscriptions owned" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
-- Delivery records are intentionally service-role only: no authenticated client policy is created.

-- After deploying reminder-dispatch, configure its project URL and scheduler token in Vault, then create the job in the Supabase dashboard or via the documented pg_cron/pg_net call. The migration deliberately does not create a job with placeholder secrets.
