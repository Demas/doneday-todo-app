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
export async function sendPushTest() {
  if (!supabase) throw new Error('Cloud setup is incomplete.')
  const { error } = await supabase.functions.invoke('send-test-push')
  if (error) throw error
}
