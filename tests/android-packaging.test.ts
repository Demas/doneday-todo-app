import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectFile = (...parts: string[]) => resolve(process.cwd(), ...parts)

describe('Android Capacitor asset packaging', () => {
  it('keeps the Capacitor entry page in the copied public assets without a legacy ignore pattern', () => {
    const gradle = readFileSync(projectFile('android', 'app', 'build.gradle'), 'utf8')
    expect(gradle).not.toContain('ignoreAssetsPattern')
    expect(existsSync(projectFile('android', 'app', 'src', 'main', 'assets', 'public', 'index.html'))).toBe(true)
  })
})
