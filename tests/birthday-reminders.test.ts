import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { birthdayReminderTimes, localDate, normalizeBirthdayReminderOffsets, parseData, type Birthday } from '../src/domain'

const birthday: Birthday = { id: 'diana', name: 'Diana', month: 1, day: 2, relationship: 'Friend', notes: 'Private note', giftIdeas: 'Private gift', photo: '', reminderOffsets: [3, 1, 0], reminderTime: '09:00', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }

describe('birthday reminders', () => {
  it('keeps only the three supported offsets and supports disabling them all', () => {
    expect(normalizeBirthdayReminderOffsets([7, 3, 1, 0, 3])).toEqual([3, 1, 0])
    expect(normalizeBirthdayReminderOffsets([7])).toEqual([])
    expect(normalizeBirthdayReminderOffsets([])).toEqual([])
  })

  it('removes a legacy seven-day value while preserving other birthday data', () => {
    const data = parseData(JSON.stringify({ version: 2, tasks: [], categories: [], birthdays: [{ ...birthday, reminderOffsets: [7, 3, 1], notes: 'keep me', giftIdeas: 'keep me too' }], routines: [], settings: {} }))
    expect(data.birthdays[0]).toMatchObject({ name: 'Diana', reminderOffsets: [3, 1], notes: 'keep me', giftIdeas: 'keep me too' })
  })

  it('calculates calendar-day offsets at the selected local reminder time', () => {
    const times = birthdayReminderTimes(birthday, new Date('2026-12-30T12:00:00'))
    expect(times.map(item => item.offset)).toEqual([3, 1, 0])
    expect(times.map(item => `${localDate(item.at)} ${String(item.at.getHours()).padStart(2, '0')}:${String(item.at.getMinutes()).padStart(2, '0')}`)).toEqual(['2026-12-30 09:00', '2027-01-01 09:00', '2027-01-02 09:00'])
  })

  it('honors the February 29 policy for annual reminder dates', () => {
    const leapBirthday: Birthday = { ...birthday, month: 2, day: 29, reminderOffsets: [0] }
    expect(birthdayReminderTimes(leapBirthday, new Date('2025-02-27T12:00:00'), 'mar1')[0].at.toISOString().slice(0, 10)).toBe('2025-03-01')
  })

  it('backfills active birthdays safely and keeps scheduling server-side, owner-scoped, and separate from task reminders', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202610240001_birthday_reminders.sql'), 'utf8')
    const dispatcher = readFileSync(resolve(process.cwd(), 'supabase/functions/reminder-dispatch/index.ts'), 'utf8')
    expect(migration).toContain("where value in ('0', '1', '3')")
    expect(migration).toContain("case when jsonb_typeof(v_birthday.data -> 'reminderOffsets') = 'array'")
    expect(migration).toContain('Backfill every active birthday once during')
    expect(migration).toContain('select id from public.birthdays where deleted_at is null')
    expect(migration).toContain('perform public.rebuild_birthday_reminders(v_birthday_id)')
    expect(migration).toContain('birthday_id = v_birthday.id')
    expect(migration).toContain('at time zone v_timezone')
    expect(migration).toContain("where public.reminder_schedules.status in ('pending', 'cancelled', 'failed')")
    expect(migration).toContain('revoke insert, update, delete on table public.reminder_schedules from anon, authenticated')
    expect(migration).toContain('grant execute on function public.rebuild_birthday_reminders(text) to service_role')
    expect(dispatcher).toContain('if (delivered && schedule.birthday_id)')
    expect(dispatcher).toContain("admin.rpc('rebuild_birthday_reminders'")
    expect(dispatcher).toContain("title: schedule.payload?.title || 'DoneDay Reminder'")
  })
})
