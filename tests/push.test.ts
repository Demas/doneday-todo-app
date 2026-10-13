import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../src/supabase', () => ({
  supabase: { functions: { invoke: mocks.invoke } },
}))

const { sendPushTest } = await import('../src/push')

describe('background push test request', () => {
  beforeEach(() => { mocks.invoke.mockReset() })

  it('explains a rejected session without exposing function internals', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ code: 'UNAUTHORIZED' }), { status: 401 }) } })
    await expect(sendPushTest()).rejects.toThrow(/session has expired/i)
  })

  it('distinguishes an absent device subscription and a push delivery rejection', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ code: 'NO_SUBSCRIPTIONS' }), { status: 404 }) } })
    await expect(sendPushTest()).rejects.toThrow(/No devices are registered/i)
    mocks.invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ code: 'PUSH_DELIVERY_FAILED' }), { status: 502 }) } })
    await expect(sendPushTest()).rejects.toThrow(/push service did not accept/i)
  })

  it('keeps VAPID diagnostics useful without returning key material', async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ code: 'VAPID_PUBLIC_KEY_INVALID' }), { status: 503 }) } })
    await expect(sendPushTest()).rejects.toThrow(/configuration needs attention/i)
  })

  it('reports a successful dispatch without claiming that the device displayed it', async () => {
    mocks.invoke.mockResolvedValue({ data: { code: 'PUSH_DISPATCHED', sent: 1, message: 'Test notification dispatched to 1 device.' }, error: null })
    await expect(sendPushTest()).resolves.toBe('Test notification dispatched to 1 device.')
  })

  it('keeps CORS preflight outside JWT gateway verification and validates users in the handler', () => {
    const functionSource = readFileSync(resolve(process.cwd(), 'supabase/functions/send-test-push/index.ts'), 'utf8')
    const config = readFileSync(resolve(process.cwd(), 'supabase/config.toml'), 'utf8')
    expect(functionSource).toContain("if (request.method === 'OPTIONS')")
    expect(functionSource).toContain("'Access-Control-Allow-Origin': origin")
    expect(functionSource).toContain('client.auth.getUser()')
    expect(functionSource).toContain("logFailure('configure_vapid', cause)")
    expect(functionSource).toContain('VAPID_PUBLIC_KEY_INVALID')
    expect(config).toMatch(/\[functions\.send-test-push\]\s+verify_jwt = false/)
  })
})
