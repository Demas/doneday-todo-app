import { Capacitor, registerPlugin } from '@capacitor/core'
import { useEffect, useMemo, useState } from 'react'
import { nextBirthday, type AlarmConfig, type AppData, type Birthday, type Task } from './domain'

export type AlarmCapability = {
  platform: 'android' | 'ios' | 'web'
  smartAlarms: boolean
  exactAlarms: boolean
  notificationPermission: 'granted' | 'denied' | 'prompt' | 'unavailable'
  message: string
}

export type NativeAlarm = {
  id: string
  title: string
  body: string
  date: string
  time: string
  timezone: string
  recurrence: string
  recurrenceDays: number[]
  ringtone: AlarmConfig['ringtone']
  vibrate: boolean
  snoozeMinutes: AlarmConfig['snoozeMinutes']
}

type DoneDayAlarmPlugin = {
  getCapabilities(): Promise<AlarmCapability>
  requestPermissions(): Promise<AlarmCapability>
  syncAlarms(options: { alarms: NativeAlarm[] }): Promise<void>
  testAlarm(options: Omit<NativeAlarm, 'date' | 'time'>): Promise<void>
}

const NativeAlarms = registerPlugin<DoneDayAlarmPlugin>('DoneDayAlarm')
const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export const webAlarmCapability = (): AlarmCapability => ({
  platform: 'web', smartAlarms: false, exactAlarms: false,
  notificationPermission: typeof Notification === 'undefined' ? 'unavailable' : Notification.permission === 'default' ? 'prompt' : Notification.permission,
  message: 'Smart Alarms need the DoneDay Android app. Web notifications cannot keep ringing after a browser is closed.',
})

export async function alarmCapability(): Promise<AlarmCapability> {
  if (!Capacitor.isNativePlatform()) return webAlarmCapability()
  if (Capacitor.getPlatform() === 'ios') return {
    platform: 'ios', smartAlarms: false, exactAlarms: false, notificationPermission: 'unavailable',
    message: 'AlarmKit support requires the iOS native target and an iOS 26+ device. This build uses notification fallback until that target is validated.',
  }
  try { return await NativeAlarms.getCapabilities() } catch { return { ...webAlarmCapability(), platform: 'android', message: 'Native alarm support is unavailable in this Android build.' } }
}

export async function requestNativeAlarmPermissions() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return webAlarmCapability()
  return NativeAlarms.requestPermissions()
}

export const nativeAlarmForTask = (task: Task): NativeAlarm | null => {
  const alarm = task.alarm
  if (!alarm?.enabled || alarm.mode !== 'smart' || task.completed || !task.dueDate || !task.dueTime) return null
  return { id: `task:${task.id}`, title: task.title, body: task.description || 'DoneDay task alarm', date: task.dueDate, time: task.dueTime, timezone: alarm.timezone || deviceTimezone(), recurrence: task.recurrence, recurrenceDays: task.recurrenceDays, ringtone: alarm.ringtone, vibrate: alarm.vibrate, snoozeMinutes: alarm.snoozeMinutes }
}

export const nativeAlarmForBirthday = (birthday: Birthday, leapDayPolicy: AppData['settings']['leapDayPolicy']): NativeAlarm | null => {
  const alarm = birthday.alarm
  if (!alarm?.enabled || alarm.mode !== 'smart') return null
  const next = nextBirthday(birthday, new Date(), leapDayPolicy)
  const date = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  return { id: `birthday:${birthday.id}`, title: `${birthday.name}'s birthday`, body: 'A birthday reminder from DoneDay', date, time: birthday.reminderTime, timezone: alarm.timezone || deviceTimezone(), recurrence: 'annual', recurrenceDays: [], ringtone: alarm.ringtone, vibrate: alarm.vibrate, snoozeMinutes: alarm.snoozeMinutes }
}

export const nativeAlarmsForData = (data: AppData) => [
  ...data.tasks.map(nativeAlarmForTask).filter((alarm): alarm is NativeAlarm => Boolean(alarm)),
  ...data.birthdays.map(birthday => nativeAlarmForBirthday(birthday, data.settings.leapDayPolicy)).filter((alarm): alarm is NativeAlarm => Boolean(alarm)),
]

/** Keeps definitions synced to each native device. The device owns scheduling and never uploads credentials. */
export function useNativeAlarmSync(data: AppData) {
  const alarms = useMemo(() => nativeAlarmsForData(data), [data])
  const serialized = JSON.stringify(alarms)
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return
    void NativeAlarms.syncAlarms({ alarms }).catch(() => undefined)
  }, [serialized])
}

export function useAlarmCapability() {
  const [capability, setCapability] = useState<AlarmCapability>(webAlarmCapability)
  useEffect(() => { void alarmCapability().then(setCapability) }, [])
  return capability
}

export async function testSmartAlarm(title: string, config: AlarmConfig) {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') throw new Error('Smart Alarm tests require the DoneDay Android app.')
  await NativeAlarms.testAlarm({ id: `test:${crypto.randomUUID()}`, title, body: 'This is a DoneDay Smart Alarm test.', timezone: config.timezone || deviceTimezone(), recurrence: 'none', recurrenceDays: [], ringtone: config.ringtone, vibrate: config.vibrate, snoozeMinutes: config.snoozeMinutes })
}
