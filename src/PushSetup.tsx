import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { disablePushForDevice, enablePushForDevice, pushSupport, sendPushTest } from './push'

export function PushSetup() {
  const [message, setMessage] = useState('Checking this device…')
  const [busy, setBusy] = useState(false)
  useEffect(() => { const support = pushSupport(); setMessage(!support.supported ? 'This browser does not support background push.' : !support.configured ? 'Background push needs VAPID setup.' : Notification.permission === 'denied' ? 'Notifications are blocked for DoneDay.' : 'Set up this device for background notifications.') }, [])
  const run = async (work: () => Promise<string>) => { setBusy(true); try { setMessage(await work()) } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update this device.') } finally { setBusy(false) } }
  return <aside className="push-setup" aria-live="polite"><BellRing size={16}/><span>{message}</span><div><button className="btn secondary small" disabled={busy || !pushSupport().configured} onClick={() => void run(async () => { await enablePushForDevice(); return 'This device is registered for background push.' })}>Enable push</button><button className="btn secondary small" disabled={busy || !pushSupport().configured} onClick={() => void run(sendPushTest)}>Send test</button><button className="btn secondary small" disabled={busy} onClick={() => void run(async () => { await disablePushForDevice(); return 'This device was unsubscribed.' })}>Unsubscribe</button></div></aside>
}
