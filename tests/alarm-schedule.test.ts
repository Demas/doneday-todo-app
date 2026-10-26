import { describe, expect, it } from 'vitest'
import { canonicalTimeZone, createAlarmScheduleDefinition, effectiveAlarmTimeZone, isValidIanaTimeZone, resolveAlarmOccurrence } from '../src/alarmSchedule'
import { nativeAlarmForBirthday, nativeAlarmForTask, nativeAlarmsForData } from '../src/alarms'
import { createTask, DEFAULT_DATA, defaultAlarmConfig, parseData, type Birthday } from '../src/domain'

const schedule = (overrides: Partial<Parameters<typeof createAlarmScheduleDefinition>[0]> = {}) => createAlarmScheduleDefinition({ reminderId: 'task:one', localDate: '2026-10-10', localTime: '09:00', timezone: 'Africa/Lagos', timezoneMode: 'fixed', recurrence: 'none', recurrenceDays: [], scheduleRevision: 1, ...overrides })!

describe('canonical Smart Alarm scheduling', () => {
  it('accepts named IANA zones and rejects invalid timezone identifiers', () => {
    for (const timezone of ['Africa/Lagos', 'Europe/London', 'America/New_York', 'Asia/Kathmandu']) {
      expect(isValidIanaTimeZone(timezone)).toBe(true)
      expect(canonicalTimeZone(timezone)).toBeTruthy()
    }
    expect(isValidIanaTimeZone('Not/A_Timezone')).toBe(false)
    expect(createAlarmScheduleDefinition({ reminderId: 'bad', localDate: '2026-10-10', localTime: '09:00', timezone: 'Not/A_Timezone', timezoneMode: 'fixed', recurrence: 'none', recurrenceDays: [], scheduleRevision: 1 })).toBeNull()
  })

  it('uses the fixed zone while travelling and follows the current device zone only when selected', () => {
    const fixed = schedule({ timezone: 'Africa/Lagos' })
    const followDevice = schedule({ timezoneMode: 'follow-device' })
    expect(effectiveAlarmTimeZone(fixed, 'America/New_York')).toBe('Africa/Lagos')
    expect(effectiveAlarmTimeZone(followDevice, 'Europe/London')).toBe('Europe/London')
    expect(effectiveAlarmTimeZone(followDevice, 'Asia/Kathmandu')).toBe('Asia/Katmandu')
  })

  it('moves a spring-forward gap to the first valid local minute and chooses the earlier fall-back occurrence', () => {
    const gap = resolveAlarmOccurrence(schedule({ localDate: '2026-03-29', localTime: '01:30', timezone: 'Europe/London' }))
    expect(gap).toMatchObject({ timezone: 'Europe/London', resolution: 'gap-shifted-forward' })
    expect(gap?.at.toISOString()).toBe('2026-03-29T01:00:00.000Z')

    const fold = resolveAlarmOccurrence(schedule({ localDate: '2026-11-01', localTime: '01:30', timezone: 'America/New_York' }))
    expect(fold).toMatchObject({ timezone: 'America/New_York', resolution: 'fold-earlier' })
    expect(fold?.at.toISOString()).toBe('2026-11-01T05:30:00.000Z')
  })

  it('keeps recurrence, civil date/time, identity, and revision in the shared definition', () => {
    const recurring = schedule({ reminderId: 'task:weekly', localDate: '2026-10-12', localTime: '08:15', recurrence: 'selected-days', recurrenceDays: [1, 3, 1], scheduleRevision: 4 })
    expect(recurring).toEqual(expect.objectContaining({ version: 1, reminderId: 'task:weekly', localDate: '2026-10-12', localTime: '08:15', recurrence: 'selected-days', recurrenceDays: [1, 3], scheduleRevision: 4 }))
  })

  it('normalizes legacy valid alarms, preserves a legacy invalid zone for repair, and never schedules it', () => {
    const data = parseData(JSON.stringify({ version: 2, tasks: [createTask({ id: 'legacy-valid', title: 'Keep valid', dueDate: '2026-10-12', dueTime: '09:00', alarm: { mode: 'smart', enabled: true, ringtone: 'alarm', vibrate: true, snoozeMinutes: 10, timezone: 'Africa/Lagos' } as never }), createTask({ id: 'legacy-invalid', title: 'Repair invalid', dueDate: '2026-10-12', dueTime: '09:00', alarm: { mode: 'smart', enabled: true, ringtone: 'alarm', vibrate: true, snoozeMinutes: 10, timezone: 'Not/A_Timezone' } as never })], categories: [], birthdays: [], routines: [], settings: {} }))
    expect(data.tasks[0].alarm).toMatchObject({ scheduleVersion: 1, scheduleRevision: 1, timezoneMode: 'fixed', timezone: 'Africa/Lagos' })
    expect(data.tasks[1].alarm?.timezone).toBe('Not/A_Timezone')
    expect(nativeAlarmForTask(data.tasks[0])).not.toBeNull()
    expect(nativeAlarmForTask(data.tasks[1])).toBeNull()
  })

  it('removes native definitions after completion/deletion and keeps one occurrence per reminder identity', () => {
    const alarm = { ...defaultAlarmConfig(), mode: 'smart' as const, timezone: 'Africa/Lagos' }
    const task = createTask({ id: 'same', title: 'Scheduled', dueDate: '2026-10-12', dueTime: '09:00', alarm })
    expect(nativeAlarmForTask({ ...task, completed: true })).toBeNull()
    expect(nativeAlarmsForData({ ...DEFAULT_DATA, tasks: [task, task] })).toHaveLength(1)
    expect(nativeAlarmsForData({ ...DEFAULT_DATA, tasks: [] })).toEqual([])
  })

  it('creates a revisioned annual birthday schedule and preserves February 29 policy behavior', () => {
    const birthday: Birthday = { id: 'leap', name: 'Leap', month: 2, day: 29, relationship: 'Friend', notes: '', giftIdeas: '', photo: '', reminderOffsets: [0], reminderTime: '09:00', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', alarm: { ...defaultAlarmConfig(), mode: 'smart', timezone: 'Europe/London', scheduleRevision: 7 } }
    const native = nativeAlarmForBirthday(birthday, 'mar1')
    expect(native).toMatchObject({ reminderId: 'birthday:leap', recurrence: 'annual', scheduleRevision: 7, timezone: 'Europe/London' })
  })
})
