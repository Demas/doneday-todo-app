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
})
