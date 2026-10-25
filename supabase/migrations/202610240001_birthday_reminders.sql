-- DoneDay 4.0 birthday reminders. Apply with `supabase db push` only after review.
-- Birthday schedules are server generated so browser timers are never the delivery source.

-- Remove the retired seven-day option without changing names, dates, notes, photos, or gift ideas.
update public.birthdays
set data = jsonb_set(
  data,
  '{reminderOffsets}',
  coalesce((
    select jsonb_agg(reminder_day_offset order by case reminder_day_offset when 3 then 1 when 1 then 2 else 3 end)
    from (
      select distinct value::integer as reminder_day_offset
      from jsonb_array_elements_text(
        case when jsonb_typeof(data -> 'reminderOffsets') = 'array'
          then data -> 'reminderOffsets'
          else '[]'::jsonb
        end
      )
      where value in ('0', '1', '3')
    ) selected_offsets
  ), '[]'::jsonb),
  true
), updated_at = now()
where jsonb_typeof(data -> 'reminderOffsets') = 'array'
  and exists (
    select 1 from jsonb_array_elements_text(
      case when jsonb_typeof(data -> 'reminderOffsets') = 'array'
        then data -> 'reminderOffsets'
        else '[]'::jsonb
      end
    ) as old_offset(value)
    where old_offset.value = '7'
  );

-- This is safe when an earlier pre-release scheduler created a seven-day schedule.
update public.reminder_schedules
set status = 'cancelled', updated_at = now()
where birthday_id is not null
  and status = 'pending'
  and payload ->> 'offset' = '7';

-- Only the trigger and service-role dispatcher can create or alter server schedules.
revoke insert, update, delete on table public.reminder_schedules from anon, authenticated;

create or replace function public.rebuild_birthday_reminders(p_birthday_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_birthday public.birthdays%rowtype;
  v_timezone text;
  v_policy text;
  v_reminder_time time;
  v_offset integer;
  v_year integer;
  v_occurrence_date date;
  v_send_at timestamptz;
  v_schedule_id text;
  v_body text;
begin
  select * into v_birthday from public.birthdays where id = p_birthday_id;
  if not found then return; end if;

  update public.reminder_schedules
  set status = 'cancelled', updated_at = now()
  where birthday_id = v_birthday.id and status = 'pending';
  if v_birthday.deleted_at is not null then return; end if;

  select timezone into v_timezone from public.profiles where id = v_birthday.user_id;
  v_timezone := coalesce(v_timezone, 'UTC');
  if not exists (select 1 from pg_timezone_names where name = v_timezone) then v_timezone := 'UTC'; end if;

  select coalesce(data ->> 'leapDayPolicy', 'feb28') into v_policy
  from public.user_settings where user_id = v_birthday.user_id;
  v_policy := case when v_policy = 'mar1' then 'mar1' else 'feb28' end;

  begin
    v_reminder_time := coalesce((v_birthday.data ->> 'reminderTime')::time, time '09:00');
  exception when others then
    v_reminder_time := time '09:00';
  end;

  -- Keeping this year and next year queued means a delivered reminder replenishes
  -- the following year without requiring the browser to be opened.
  for v_year in extract(year from (now() at time zone v_timezone))::integer .. extract(year from (now() at time zone v_timezone))::integer + 1 loop
    begin
      if v_birthday.month = 2 and v_birthday.day = 29 and not (v_year % 4 = 0 and (v_year % 100 <> 0 or v_year % 400 = 0)) then
        v_occurrence_date := case when v_policy = 'mar1' then make_date(v_year, 3, 1) else make_date(v_year, 2, 28) end;
      else
        v_occurrence_date := make_date(v_year, v_birthday.month, v_birthday.day);
      end if;
    exception when datetime_field_overflow then
      continue;
    end;

    for v_offset in
      select distinct value::integer
      from jsonb_array_elements_text(
        case when jsonb_typeof(v_birthday.data -> 'reminderOffsets') = 'array'
          then v_birthday.data -> 'reminderOffsets'
          else '[]'::jsonb
        end
      )
      where value in ('0', '1', '3')
    loop
      v_send_at := ((v_occurrence_date - v_offset) + v_reminder_time) at time zone v_timezone;
      if v_send_at <= now() then continue; end if;
      v_body := case v_offset
        when 3 then '🎂 ' || v_birthday.name || '''s birthday is in 3 days!'
        when 1 then '🎂 Tomorrow is ' || v_birthday.name || '''s birthday!'
        else '🎉 Today is ' || v_birthday.name || '''s birthday! Don''t forget to celebrate.'
      end;
      v_schedule_id := 'birthday:' || v_birthday.id || ':' || to_char(v_occurrence_date, 'YYYY-MM-DD') || ':' || v_offset;
      insert into public.reminder_schedules(id, user_id, birthday_id, send_at, payload, status, attempts, locked_at, sent_at)
      values (
        v_schedule_id,
        v_birthday.user_id,
        v_birthday.id,
        v_send_at,
        jsonb_build_object('title', 'DoneDay Birthday', 'body', v_body, 'url', '/?birthday=' || (v_birthday.data ->> 'id'), 'kind', 'birthday', 'offset', v_offset),
        'pending', 0, null, null
      )
      on conflict (id) do update set
        user_id = excluded.user_id,
        birthday_id = excluded.birthday_id,
        send_at = excluded.send_at,
        payload = excluded.payload,
        status = 'pending',
        attempts = 0,
        locked_at = null,
        sent_at = null,
        updated_at = now()
      where public.reminder_schedules.status in ('pending', 'cancelled', 'failed');
    end loop;
  end loop;
end;
$$;

create or replace function public.rebuild_birthday_reminders_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.reminder_schedules set status = 'cancelled', updated_at = now()
    where birthday_id = old.id and status = 'pending';
    return old;
  end if;
  perform public.rebuild_birthday_reminders(new.id);
  return new;
end;
$$;

drop trigger if exists birthdays_rebuild_reminders on public.birthdays;
create trigger birthdays_rebuild_reminders
after insert or update or delete on public.birthdays
for each row execute procedure public.rebuild_birthday_reminders_on_change();

create or replace function public.rebuild_birthday_reminders_on_timezone_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_birthday_id text;
begin
  if new.timezone is not distinct from old.timezone then return new; end if;
  for v_birthday_id in select id from public.birthdays where user_id = new.id and deleted_at is null loop
    perform public.rebuild_birthday_reminders(v_birthday_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_rebuild_birthday_reminders on public.profiles;
create trigger profiles_rebuild_birthday_reminders
after update of timezone on public.profiles
for each row execute procedure public.rebuild_birthday_reminders_on_timezone_change();

create or replace function public.rebuild_birthday_reminders_on_settings_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_birthday_id text;
begin
  for v_birthday_id in select id from public.birthdays where user_id = new.user_id and deleted_at is null loop
    perform public.rebuild_birthday_reminders(v_birthday_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists settings_rebuild_birthday_reminders on public.user_settings;
create trigger settings_rebuild_birthday_reminders
after insert or update on public.user_settings
for each row execute procedure public.rebuild_birthday_reminders_on_settings_change();

-- A trigger only sees future writes. Backfill every active birthday once during
-- the migration so existing users receive the same rolling schedule immediately.
-- The scheduler is idempotent: deterministic IDs update pending/cancelled/failed
-- rows and never reopen a sent schedule.
do $$
declare v_birthday_id text;
begin
  for v_birthday_id in
    select id from public.birthdays where deleted_at is null
  loop
    perform public.rebuild_birthday_reminders(v_birthday_id);
  end loop;
end;
$$;

-- Authenticated users keep read-only access through the existing owner RLS policy.
-- The Edge Function uses the service role to replenish an annual rolling horizon.
revoke all on function public.rebuild_birthday_reminders(text) from public, anon, authenticated;
grant execute on function public.rebuild_birthday_reminders(text) to service_role;
