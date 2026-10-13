import { supabase } from './supabase'

const publicVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim()
const toUint8 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0))

export const pushSupport = () => ({ supported: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window, configured: Boolean(publicVapidKey && supabase) })
export async function registerDoneDayServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}
export async function enablePushForDevice() {
  if (!supabase || !publicVapidKey) throw new Error('Background push has not been configured yet.')
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('This browser does not support web push.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted.')
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(publicVapidKey) })
  const json = subscription.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, user_agent: navigator.userAgent, updated_at: new Date().toISOString() }, { onConflict: 'endpoint' })
  if (error) throw error
}
export async function disablePushForDevice() {
  if (!supabase) return
  const registration = await navigator.serviceWorker.getRegistration()
  const subscription = await registration?.pushManager.getSubscription()
  if (subscription) { await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint); await subscription.unsubscribe() }
}
type PushFunctionResult = { code?: string; message?: string; sent?: number }

async function functionErrorMessage(error: unknown) {
  const candidate = error as { context?: unknown; message?: unknown }
  const response = candidate?.context
  if (response instanceof Response) {
    try {
      const body = await response.clone().json() as PushFunctionResult
      if (body.code === 'UNAUTHORIZED') return 'Your session has expired. Sign in again before sending a test notification.'
      if (body.code === 'NO_SUBSCRIPTIONS') return 'No devices are registered for background push. Select Enable push on this device first.'
      if (body.code === 'PUSH_DELIVERY_FAILED') return 'DoneDay reached your registered device, but the push service did not accept the notification.'
      if (body.code === 'PUSH_NOT_CONFIGURED') return 'DoneDay push delivery has not been configured on the server.'
      if (body.code === 'VAPID_SUBJECT_INVALID' || body.code === 'VAPID_PUBLIC_KEY_INVALID' || body.code === 'VAPID_PRIVATE_KEY_INVALID' || body.code === 'VAPID_CONFIGURATION_FAILED') return 'DoneDay push configuration needs attention on the server.'
      if (body.code === 'PUSH_RUNTIME_UNSUPPORTED') return 'The DoneDay push runtime is unavailable on the server.'
      if (body.code === 'SUBSCRIPTIONS_UNAVAILABLE') return 'DoneDay could not load your registered devices. Retry in a moment.'
      if (typeof body.message === 'string' && body.message) return body.message
    } catch { /* Use the status below when the response has no JSON body. */ }
    if (response.status === 401) return 'Your session has expired. Sign in again before sending a test notification.'
    if (response.status === 404) return 'No devices are registered for background push. Select Enable push on this device first.'
    if (response.status >= 500) return 'DoneDay could not send the test notification. Retry in a moment.'
  }
  const message = typeof candidate?.message === 'string' ? candidate.message : ''
  if (/failed to send a request|fetch|network|cors/i.test(message)) return 'DoneDay could not reach the notification service. Check your connection or browser CORS settings, then retry.'
  return 'DoneDay could not send the test notification. Retry in a moment.'
}

export async function sendPushTest(): Promise<string> {
  if (!supabase) throw new Error('Cloud setup is incomplete.')
  const { data, error } = await supabase.functions.invoke<PushFunctionResult>('send-test-push')
  if (error) throw new Error(await functionErrorMessage(error))
  if (data?.code !== 'PUSH_DISPATCHED') throw new Error(data?.message || 'DoneDay could not send the test notification. Retry in a moment.')
  return data.message || `Test notification dispatched to ${data.sent ?? 0} device${data.sent === 1 ? '' : 's'}.`
}
