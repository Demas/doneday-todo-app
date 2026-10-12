import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const url = Deno.env.get('SUPABASE_URL')!
const secret = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const schedulerSecret = Deno.env.get('SCHEDULER_SECRET')!
const admin = createClient(url, secret, { auth: { persistSession: false } })

Deno.serve(async request => {
  if (request.headers.get('x-scheduler-secret') !== schedulerSecret) return new Response('Unauthorized', { status: 401 })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const now = new Date().toISOString()
  const { data: schedules, error } = await admin.from('reminder_schedules').select('*').eq('status', 'pending').lte('send_at', now).limit(100)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  let processed = 0
  for (const schedule of schedules ?? []) {
    // The conditional update acts as a database-backed lease and prevents concurrent cron runs from double-sending.
    const { data: locked } = await admin.from('reminder_schedules').update({ status: 'sending', locked_at: now, attempts: schedule.attempts + 1, updated_at: now }).eq('id', schedule.id).eq('status', 'pending').select().maybeSingle()
    if (!locked) continue
    const { data: subscriptions } = await admin.from('push_subscriptions').select('*').eq('user_id', schedule.user_id)
    let delivered = 0
    for (const subscription of subscriptions ?? []) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ id: schedule.id, title: 'DoneDay Reminder', body: schedule.payload?.body || 'You have a scheduled reminder.', url: schedule.payload?.url || '/' }))
        delivered++; await admin.from('notification_deliveries').upsert({ schedule_id: schedule.id, endpoint: subscription.endpoint, state: 'sent' }, { onConflict: 'schedule_id,endpoint' })
      } catch (error) {
        const status = Number((error as { statusCode?: number }).statusCode || 0)
        await admin.from('notification_deliveries').upsert({ schedule_id: schedule.id, endpoint: subscription.endpoint, state: status === 404 || status === 410 ? 'expired' : 'failed', detail: String(error).slice(0, 500) }, { onConflict: 'schedule_id,endpoint' })
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
      }
    }
    await admin.from('reminder_schedules').update({ status: delivered ? 'sent' : (locked.attempts >= 3 ? 'failed' : 'pending'), sent_at: delivered ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', schedule.id)
    processed++
  }
  return Response.json({ processed })
})
