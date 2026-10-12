import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PWA shell', () => {
  const root = resolve(process.cwd())
  it('declares a standalone DoneDay manifest and push-capable service worker', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'public/manifest.webmanifest'), 'utf8'))
    const worker = readFileSync(resolve(root, 'public/sw.js'), 'utf8')
    expect(manifest.name).toContain('DoneDay')
    expect(manifest.display).toBe('standalone')
    expect(worker).toContain("addEventListener('push'")
    expect(worker).toContain("addEventListener('notificationclick'")
  })
})
