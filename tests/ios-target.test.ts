import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('iOS target foundation', () => {
  it('declares the matching Capacitor iOS runtime and sync workflow', () => {
    const packageJson = JSON.parse(source('package.json')) as { dependencies: Record<string, string>; scripts: Record<string, string> }
    expect(packageJson.dependencies['@capacitor/ios']).toMatch(/^\^8\./)
    expect(packageJson.scripts['ios:sync']).toContain('cap sync ios')
    expect(packageJson.scripts['ios:open']).toContain('cap open ios')
  })

  it('creates an iOS target with the required AlarmKit usage explanation', () => {
    expect(source('ios/App/App.xcodeproj/project.pbxproj')).toContain('App.app')
    expect(source('ios/App/App/Info.plist')).toContain('NSAlarmKitUsageDescription')
  })
})
