import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const nativeSource = (file: string) => readFileSync(resolve(process.cwd(), 'android', 'app', 'src', 'main', 'java', 'app', 'doneday', 'mobile', file), 'utf8')

describe('Android Smart Alarm native workflow', () => {
  it('persists a test alarm separately so the receiver and activity can resolve it', () => {
    const scheduler = nativeSource('DoneDayAlarmScheduler.java')
    expect(scheduler).toContain('static final String TEMPORARY = "temporary_definitions"')
    expect(scheduler).toMatch(/storeTemporary\(context, alarm\);\s*scheduleAt\(context, alarm, System\.currentTimeMillis\(\) \+ 5000L\)/)
    expect(scheduler).toContain('return savedAlarm != null ? savedAlarm : findIn(context, TEMPORARY, id);')
    expect(scheduler).toContain('putString(TEMPORARY, retained.toString()).commit()')
    expect(scheduler).toContain('if (removeTemporary(context, id)) cancel(context, id);')
  })

  it('keeps notification actions and the active ringing activity synchronized', () => {
    const actions = nativeSource('DoneDayAlarmActionReceiver.java')
    const activity = nativeSource('DoneDayAlarmActivity.java')
    expect(actions).toContain('DoneDayAlarmScheduler.snooze(context, id')
    expect(actions).toContain('DoneDayAlarmScheduler.dismiss(context, id)')
    expect(actions).toContain('DoneDayAlarmScheduler.ACTION_DISMISS_RINGING')
    expect(activity).toContain('stopAlarm();')
    expect(activity).toContain('registerReceiver(actionReceiver, filter')
  })

  it('uses the selected Android alarm tone and keeps inexact and full-screen permission states visible', () => {
    const receiver = nativeSource('DoneDayAlarmReceiver.java')
    const plugin = nativeSource('DoneDayAlarmPlugin.java')
    expect(receiver).toContain('CHANNEL_PREFIX + ("notification".equals(ringtone) || "ringtone".equals(ringtone) ? ringtone : "alarm")')
    expect(receiver).toContain('alarmChannel.setSound(DoneDayAlarmScheduler.ringtoneUri(alarm)')
    expect(plugin).toContain('result.put("smartAlarms", notifications)')
    expect(plugin).toContain('result.put("fullScreenIntents", fullScreen)')
    expect(plugin).toContain('Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT')
  })

  it('validates named timezones and applies the shared DST and travel contract without a GMT fallback', () => {
    const scheduler = nativeSource('DoneDayAlarmScheduler.java')
    expect(scheduler).toContain('KNOWN_TIME_ZONES')
    expect(scheduler).toContain('"follow-device".equals(alarm.getString("timezoneMode", "fixed"))')
    expect(scheduler).toContain('DoneDay alarm timezone is not a valid IANA timezone.')
    expect(scheduler).toContain('resolveWallClock')
    expect(scheduler).toContain('a spring-forward gap moves to its first valid local minute; a fall-back fold uses the earlier instant')
    expect(scheduler).toContain('alarm.getString("localDate", alarm.getString("date", ""))')
  })
})
