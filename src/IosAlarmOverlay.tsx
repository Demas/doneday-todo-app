import type { NativeAlarmEvent } from './alarms'

export function IosAlarmOverlay({ alarm, onStop, onSnooze }: { alarm: NativeAlarmEvent; onStop: () => void; onSnooze: () => void }) {
  return <div className="alarm-popover ios-alarm-popover" role="alertdialog" aria-modal="true" aria-label="DoneDay alarm">
    <div>
      <strong>{alarm.title}</strong>
      <p>{alarm.body || 'DoneDay alarm'}</p>
      <small>This active-app alarm screen is available while DoneDay is open.</small>
    </div>
    <button className="btn secondary small" onClick={onSnooze}>Snooze {alarm.snoozeMinutes}m</button>
    <button className="btn primary small" onClick={onStop}>Stop</button>
  </div>
}
