import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('iOS native alarm foundation', () => {
  it('registers the Capacitor bridge and compiles the native alarm source into the app target', () => {
    const project = source('ios/App/App.xcodeproj/project.pbxproj')
    expect(source('ios/App/App/DoneDayBridgeViewController.swift')).toContain('registerPluginInstance(DoneDayAlarmPlugin())')
    expect(source('ios/App/App/SceneDelegate.swift')).toContain('DoneDayBridgeViewController()')
    expect(project).toContain('DoneDayAlarmPlugin.swift in Sources')
    expect(project).toContain('DoneDayAlarmKit.swift in Sources')
  })

  it('uses permissioned local notification actions with safe replacement scheduling', () => {
    const plugin = source('ios/App/App/DoneDayAlarmPlugin.swift')
    expect(plugin).toContain('UNCalendarNotificationTrigger')
    expect(plugin).toContain('requestAuthorization(options: [.alert, .badge, .sound])')
    expect(plugin).toContain('DONE_DAY_ALARM_STOP')
    expect(plugin).toContain('DONE_DAY_ALARM_SNOOZE')
    expect(plugin).toContain('Never delete an existing schedule after a failed replacement.')
    expect(plugin).toContain('UIApplication.significantTimeChangeNotification')
    expect(plugin).toContain('TimeZone.knownTimeZoneIdentifiers.contains(timezone)')
    expect(plugin).toContain('repeatedTimePolicy: .first')
  })

  it('keeps AlarmKit behind an iOS 26 and SDK availability gate', () => {
    const alarmKit = source('ios/App/App/DoneDayAlarmKit.swift')
    expect(alarmKit).toContain('#if canImport(AlarmKit)')
    expect(alarmKit).toContain('@available(iOS 26.0, *)')
    expect(alarmKit).toContain('static let isEnabled = false')
  })

  it('defines the browser bridge and active-app Stop/Snooze interface without changing Android sources', () => {
    const bridge = source('src/alarms.ts')
    expect(bridge).toContain("addListener(eventName: 'alarmDue'")
    expect(bridge).toContain("Capacitor.getPlatform() !== 'ios'")
    expect(source('src/IosAlarmOverlay.tsx')).toContain('Snooze {alarm.snoozeMinutes}m')
    expect(source('android/app/src/main/java/app/doneday/mobile/DoneDayAlarmScheduler.java')).toContain('class DoneDayAlarmScheduler')
  })
})

