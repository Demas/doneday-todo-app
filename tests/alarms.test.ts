import { describe, expect, it } from 'vitest'
import { nativeAlarmForBirthday, nativeAlarmForTask, nativeAlarmsForData, webAlarmCapability } from '../src/alarms'
import { createTask, DEFAULT_DATA, defaultAlarmConfig, type Birthday } from '../src/domain'

describe('Smart Alarm definitions', () => {
  it('only schedules explicitly enabled Smart Alarms with a date and time', () => {
    const task = createTask({ title: 'Join planning meeting', dueDate: '2026-10-24', dueTime: '09:30', recurrence: 'weekly', alarm: { ...defaultAlarmConfig(), mode: 'smart', snoozeMinutes: 15 } })
    expect(nativeAlarmForTask(task)).toMatchObject({ id: `task:${task.id}`, title: 'Join planning meeting', recurrence: 'weekly', snoozeMinutes: 15 })
    expect(nativeAlarmForTask({ ...task, completed: true })).toBeNull()
    expect(nativeAlarmForTask({ ...task, alarm: { ...task.alarm!, enabled: false } })).toBeNull()
    expect(nativeAlarmForTask({ ...task, dueTime: '' })).toBeNull()
  })

  it('creates annual local schedules for enabled birthday alarms and keeps definitions in shared app data', () => {
    const birthday: Birthday = { id: 'birthday-1', name: 'Ada', month: 12, day: 24, relationship: 'Friend', notes: '', giftIdeas: '', photo: '', reminderOffsets: [0], reminderTime: '08:00', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', alarm: { ...defaultAlarmConfig(), mode: 'smart' } }
    expect(nativeAlarmForBirthday(birthday, 'feb28')).toMatchObject({ id: 'birthday:birthday-1', recurrence: 'annual', time: '08:00' })
    const task = createTask({ title: 'Alarm task', dueDate: '2026-10-24', dueTime: '10:00', alarm: { ...defaultAlarmConfig(), mode: 'smart' } })
    expect(nativeAlarmsForData({ ...DEFAULT_DATA, tasks: [task], birthdays: [birthday] })).toHaveLength(2)
  })

  it('states the web limitation instead of claiming clock-style alarms', () => {
    const capability = webAlarmCapability()
    expect(capability.platform).toBe('web')
    expect(capability.smartAlarms).toBe(false)
    expect(capability.message).toMatch(/cannot keep ringing/i)
  })
})
