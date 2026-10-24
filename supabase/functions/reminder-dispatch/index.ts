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
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-scheduler-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  } : {}
}
const json = (request: Request, body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers: corsHeaders(request) })

Deno.serve(async request => {
  const origin = request.headers.get('Origin') || ''
  if (origin && !allowedOrigins.has(origin)) return json(request, { code: 'ORIGIN_NOT_ALLOWED', message: 'This website is not allowed to call DoneDay reminders.' }, 403)
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { code: 'METHOD_NOT_ALLOWED', message: 'Use POST to dispatch reminders.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const secret = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const schedulerSecret = Deno.env.get('SCHEDULER_SECRET')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!url || !secret || !schedulerSecret || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) return json(request, { code: 'PUSH_NOT_CONFIGURED', message: 'DoneDay reminder delivery has not been configured on the server.' }, 503)
  if (request.headers.get('x-scheduler-secret') !== schedulerSecret) return json(request, { code: 'UNAUTHORIZED', message: 'Scheduler authentication failed.' }, 401)

  try {
    const admin = createClient(url, secret, { auth: { persistSession: false } })
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
    const now = new Date().toISOString()
    const { data: schedules, error } = await admin.from('reminder_schedules').select('*').eq('status', 'pending').lte('send_at', now).limit(100)
    if (error) return json(request, { code: 'SCHEDULES_UNAVAILABLE', message: 'DoneDay could not load pending reminders.' }, 500)
    let processed = 0
    for (const schedule of schedules ?? []) {
      // The conditional update acts as a database-backed lease and prevents concurrent cron runs from double-sending.
      const { data: locked } = await admin.from('reminder_schedules').update({ status: 'sending', locked_at: now, attempts: schedule.attempts + 1, updated_at: now }).eq('id', schedule.id).eq('status', 'pending').select().maybeSingle()
      if (!locked) continue
      const { data: subscriptions } = await admin.from('push_subscriptions').select('*').eq('user_id', schedule.user_id)
      let delivered = 0
      for (const subscription of subscriptions ?? []) {
        try {
          await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ id: schedule.id, title: schedule.payload?.title || 'DoneDay Reminder', body: schedule.payload?.body || 'You have a scheduled reminder.', url: schedule.payload?.url || '/' }))
          delivered++; await admin.from('notification_deliveries').upsert({ schedule_id: schedule.id, endpoint: subscription.endpoint, state: 'sent' }, { onConflict: 'schedule_id,endpoint' })
        } catch (deliveryError) {
          const status = Number((deliveryError as { statusCode?: number }).statusCode || 0)
          await admin.from('notification_deliveries').upsert({ schedule_id: schedule.id, endpoint: subscription.endpoint, state: status === 404 || status === 410 ? 'expired' : 'failed', detail: String(deliveryError).slice(0, 500) }, { onConflict: 'schedule_id,endpoint' })
          if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
        }
      }
      await admin.from('reminder_schedules').update({ status: delivered ? 'sent' : (locked.attempts >= 3 ? 'failed' : 'pending'), sent_at: delivered ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', schedule.id)
      if (delivered && schedule.birthday_id) {
        const { error: replenishError } = await admin.rpc('rebuild_birthday_reminders', { p_birthday_id: schedule.birthday_id })
        if (replenishError) console.error('DoneDay birthday schedule replenish failed', { code: replenishError.code, message: replenishError.message })
      }
      processed++
    }
    return json(request, { code: 'REMINDERS_DISPATCHED', processed })
  } catch (unexpected) {
    console.error('DoneDay reminder dispatch failed unexpectedly', unexpected instanceof Error ? unexpected.name : 'unknown')
    return json(request, { code: 'REMINDER_DISPATCH_FAILED', message: 'DoneDay could not dispatch reminders.' }, 500)
  }
})
