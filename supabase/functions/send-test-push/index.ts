import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const url = Deno.env.get('SUPABASE_URL')!
const secret = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(url, secret, { auth: { persistSession: false } })
Deno.serve(async request => {
  const auth = request.headers.get('Authorization') || ''
  const client = createClient(url, Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await client.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')!, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
  const { data: subscriptions } = await admin.from('push_subscriptions').select('*').eq('user_id', user.id)
  for (const subscription of subscriptions ?? []) await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ id: `test:${Date.now()}`, title: 'DoneDay test', body: 'Background notifications are connected.', url: '/' }))
  return Response.json({ sent: subscriptions?.length ?? 0 })
})
