import { useEffect } from 'react'
import { reminderKey, taskReminderTimes, type Task } from './domain'

export type DueReminder = { task: Task; offset: number; key: string; message: string }

export function dueTaskReminders(tasks: Task[], now = new Date()): DueReminder[] {
  return tasks.flatMap(task => {
    if (task.completed) return []
    if (task.snoozeUntil) {
      const snooze = new Date(task.snoozeUntil)
      if (snooze.getTime() <= now.getTime() && now.getTime() - snooze.getTime() < 60000) return [{ task, offset: -1, key: `doneday-snoozed:${task.id}:${task.snoozeUntil}`, message: `${task.title} is ready again.` }]
    }
    return taskReminderTimes(task).filter(({ at }) => now.getTime() >= at.getTime() && now.getTime() - at.getTime() < 60000).map(({ offset, at }) => ({ task, offset, key: reminderKey(task, offset, at), message: offset === 0 ? task.title : `${task.title} is due in ${offset === 60 ? '1 hour' : offset === 1440 ? '1 day' : `${offset} minutes`}.` }))
  })
}

export function playReminderSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const audio = new AudioContextClass(); const oscillator = audio.createOscillator(); const gain = audio.createGain()
    oscillator.frequency.value = 880; gain.gain.setValueAtTime(0.08, audio.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35)
    oscillator.connect(gain).connect(audio.destination); oscillator.start(); oscillator.stop(audio.currentTime + 0.35)
  } catch { /* A browser may require a user gesture before it permits sound. */ }
}

export function useReminderScheduler(tasks: Task[], enabled: boolean, sound: boolean, onDue: (reminder: DueReminder) => void) {
  useEffect(() => {
    if (!enabled) return
    const check = () => dueTaskReminders(tasks).forEach(reminder => {
      if (localStorage.getItem(reminder.key)) return
      localStorage.setItem(reminder.key, '1')
      if ('Notification' in window && Notification.permission === 'granted') { try { new Notification('DoneDay reminder', { body: reminder.message }) } catch { /* In-app alert remains available. */ } }
      if (sound) playReminderSound()
      onDue(reminder)
    })
    check(); const timer = window.setInterval(check, 15000); return () => window.clearInterval(timer)
  }, [tasks, enabled, sound, onDue])
}
