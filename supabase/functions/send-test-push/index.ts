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

  const authorization = request.headers.get('Authorization')
  if (!authorization) return error(request, 'UNAUTHORIZED', 'Sign in again before sending a test notification.', 401)

  const client = createClient(url, publishableKey, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await client.auth.getUser()
  if (userError || !user) return error(request, 'UNAUTHORIZED', 'Your session has expired. Sign in again before sending a test notification.', 401)

  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    const admin = createClient(url, secret, { auth: { persistSession: false } })
    const { data: subscriptions, error: subscriptionsError } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id)
    if (subscriptionsError) {
      console.error('Unable to load DoneDay push subscriptions', subscriptionsError.code)
      return error(request, 'SUBSCRIPTIONS_UNAVAILABLE', 'DoneDay could not load your registered devices. Retry in a moment.', 500)
    }
    if (!subscriptions?.length) return error(request, 'NO_SUBSCRIPTIONS', 'No devices are registered for background push. Select Enable push on this device first.', 404)

    let sent = 0
    let failed = 0
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ id: `test:${Date.now()}`, title: 'DoneDay test', body: 'Background notifications are connected.', url: '/' }))
        sent++
      } catch (pushError) {
        failed++
        const pushStatus = Number((pushError as { statusCode?: number }).statusCode || 0)
        console.error('DoneDay push delivery failed', pushStatus || 'unknown')
        if (pushStatus === 404 || pushStatus === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint).eq('user_id', user.id)
      }
    }
    if (!sent) return error(request, 'PUSH_DELIVERY_FAILED', 'DoneDay reached your registered device, but the push service did not accept the notification.', 502)
    return json(request, { code: 'PUSH_DISPATCHED', sent, failed, message: `Test notification dispatched to ${sent} device${sent === 1 ? '' : 's'}.` })
  } catch (unexpected) {
    console.error('DoneDay test push failed unexpectedly', unexpected instanceof Error ? unexpected.name : 'unknown')
    return error(request, 'PUSH_REQUEST_FAILED', 'DoneDay could not send the test notification. Retry in a moment.', 500)
  }
})
