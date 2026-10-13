import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const allowedOrigins = new Set([
  'https://doneday-todo-app.vercel.app',
  'http://localhost:5173',
])

const corsHeaders = (request: Request) => {
  const origin = request.headers.get('Origin') || ''
  return allowedOrigins.has(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } : {}
}

const json = (request: Request, body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: corsHeaders(request) })
const error = (request: Request, code: string, message: string, status: number) => json(request, { code, message }, status)

const redact = (value: string) => value
  .replace(/https?:\/\/[^\s)]+/gi, '<url>')
  .replace(/\bBearer\s+[^\s]+/gi, 'Bearer <redacted>')
  .replace(/\b(?:sb_publishable|sb_secret|eyJ)[A-Za-z0-9._-]+/g, '<redacted>')
  .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '<redacted>')
  .slice(0, 800)

const logFailure = (operation: string, cause: unknown) => {
  const source = cause instanceof Error ? cause : new Error(typeof cause === 'string' ? cause : 'Unknown error')
  console.error(JSON.stringify({
    event: 'doneday_push_failure',
    operation,
    error_name: source.name || 'Error',
    message: redact(source.message || 'No error message'),
    stack: redact(source.stack || 'No stack trace'),
  }))
}

const base64UrlBytes = (value: string) => {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0))
  } catch { return null }
}

const validateVapid = (subject: string, publicKey: string, privateKey: string) => {
  let parsed: URL
  try { parsed = new URL(subject) } catch { return 'VAPID_SUBJECT_INVALID' }
  if (parsed.protocol !== 'mailto:' && parsed.protocol !== 'https:') return 'VAPID_SUBJECT_INVALID'
  const publicBytes = base64UrlBytes(publicKey)
  if (!publicBytes || publicBytes.length !== 65 || publicBytes[0] !== 4) return 'VAPID_PUBLIC_KEY_INVALID'
  const privateBytes = base64UrlBytes(privateKey)
  if (!privateBytes || privateBytes.length !== 32) return 'VAPID_PRIVATE_KEY_INVALID'
  return null
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin') || ''
  if (origin && !allowedOrigins.has(origin)) return error(request, 'ORIGIN_NOT_ALLOWED', 'This website is not allowed to call DoneDay push.', 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return error(request, 'METHOD_NOT_ALLOWED', 'Use POST to send a test notification.', 405)

  const url = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')
  const secret = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!url || !publishableKey || !secret || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) return error(request, 'PUSH_NOT_CONFIGURED', 'DoneDay push delivery has not been configured on the server.', 503)
  const vapidProblem = validateVapid(vapidSubject, vapidPublicKey, vapidPrivateKey)
  if (vapidProblem) {
    console.error(JSON.stringify({ event: 'doneday_push_configuration_invalid', operation: 'validate_vapid', code: vapidProblem }))
    return error(request, vapidProblem, 'DoneDay push credentials are not in a valid VAPID format. Check the server configuration.', 503)
  }
  if (typeof webpush.setVapidDetails !== 'function' || typeof webpush.sendNotification !== 'function') return error(request, 'PUSH_RUNTIME_UNSUPPORTED', 'The DoneDay push runtime is unavailable on the server.', 503)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return error(request, 'UNAUTHORIZED', 'Sign in again before sending a test notification.', 401)

  let user: { id: string } | null = null
  try {
    const client = createClient(url, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
    const { data, error: userError } = await client.auth.getUser()
    if (userError || !data.user) return error(request, 'UNAUTHORIZED', 'Your session has expired. Sign in again before sending a test notification.', 401)
    user = data.user
  } catch (cause) {
    logFailure('authenticate_user', cause)
    return error(request, 'AUTH_SERVICE_UNAVAILABLE', 'DoneDay could not verify your session. Retry in a moment.', 503)
  }

  let admin: ReturnType<typeof createClient>
  try {
    admin = createClient(url, secret, { auth: { persistSession: false } })
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  } catch (cause) {
    logFailure('configure_vapid', cause)
    return error(request, 'VAPID_CONFIGURATION_FAILED', 'DoneDay could not initialize push delivery. Check the server VAPID configuration.', 503)
  }

  let subscriptions: Array<{ endpoint: string; p256dh: string; auth: string }> | null
  try {
    const { data, error: subscriptionsError } = await admin.from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', user.id)
    if (subscriptionsError) {
      console.error(JSON.stringify({ event: 'doneday_push_database_failure', operation: 'load_subscriptions', code: subscriptionsError.code || 'unknown' }))
      return error(request, 'SUBSCRIPTIONS_UNAVAILABLE', 'DoneDay could not load your registered devices. Retry in a moment.', 500)
    }
    subscriptions = data
  } catch (cause) {
    logFailure('load_subscriptions', cause)
    return error(request, 'SUBSCRIPTIONS_UNAVAILABLE', 'DoneDay could not load your registered devices. Retry in a moment.', 500)
  }
  if (!subscriptions?.length) return error(request, 'NO_SUBSCRIPTIONS', 'No devices are registered for background push. Select Enable push on this device first.', 404)

  let sent = 0
  let failed = 0
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ id: `test:${Date.now()}`, title: 'DoneDay test', body: 'Background notifications are connected.', url: '/' }))
      sent++
    } catch (cause) {
      failed++
      const pushStatus = Number((cause as { statusCode?: number }).statusCode || 0)
      logFailure('deliver_push', cause)
      if (pushStatus === 404 || pushStatus === 410) {
        const { error: deleteError } = await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint).eq('user_id', user.id)
        if (deleteError) console.error(JSON.stringify({ event: 'doneday_push_database_failure', operation: 'remove_expired_subscription', code: deleteError.code || 'unknown' }))
      }
    }
  }
  if (!sent) return error(request, 'PUSH_DELIVERY_FAILED', 'DoneDay reached your registered device, but the push service did not accept the notification.', 502)
  return json(request, { code: 'PUSH_DISPATCHED', sent, failed, message: `Test notification dispatched to ${sent} device${sent === 1 ? '' : 's'}.` })
})
