export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'selected-days'
export type ReminderOffset = 0 | 5 | 10 | 30 | 60 | 1440
export type AlarmMode = 'notification' | 'smart'
export type AlarmRingtone = 'alarm' | 'notification' | 'ringtone'
export type AlarmConfig = { mode: AlarmMode; enabled: boolean; ringtone: AlarmRingtone; vibrate: boolean; snoozeMinutes: 5 | 10 | 15 | 30; timezone: string }
export const defaultAlarmConfig = (): AlarmConfig => ({ mode: 'notification', enabled: true, ringtone: 'alarm', vibrate: true, snoozeMinutes: 10, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
export type Subtask = { id: string; title: string; completed: boolean }
export type Task = {
  id: string; title: string; description: string; completed: boolean; createdAt: string; updatedAt: string
  dueDate: string; dueTime: string; priority: Priority; categoryId: string; tags: string[]
  reminder: boolean; reminderOffsets: ReminderOffset[]; snoozeUntil: string; recurrence: Recurrence; recurrenceDays: number[]
  subtasks: Subtask[]; notes: string; completedAt: string; order: number; alarm?: AlarmConfig
}
export type Category = { id: string; name: string; color: string }
export type BirthdayRelationship = 'Family' | 'Friend' | 'Partner' | 'Colleague' | 'Other'
export type BirthdayReminderOffset = 0 | 1 | 3
export type Birthday = { id: string; name: string; month: number; day: number; year?: number; relationship: BirthdayRelationship; notes: string; giftIdeas: string; photo: string; reminderOffsets: BirthdayReminderOffset[]; reminderTime: string; createdAt: string; updatedAt: string; alarm?: AlarmConfig }
export type Routine = { id: string; title: string; time: string; period: 'morning' | 'afternoon' | 'evening'; recurrence: Exclude<Recurrence, 'none'>; recurrenceDays: number[]; completedDates: string[]; createdAt: string }
export type AppSettings = { density: 'comfortable' | 'compact'; confirmDelete: boolean; reminders: boolean; sound: boolean; leapDayPolicy: 'feb28' | 'mar1' }
export type AppData = { version: 2; tasks: Task[]; categories: Category[]; birthdays: Birthday[]; routines: Routine[]; settings: AppSettings }

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'personal', name: 'Personal', color: '#facc15' }, { id: 'work', name: 'Work', color: '#7c9cf5' },
  { id: 'shopping', name: 'Shopping', color: '#f4a261' }, { id: 'study', name: 'Study', color: '#a78bfa' },
  { id: 'meetings', name: 'Meetings', color: '#ef4444' }, { id: 'other', name: 'Other', color: '#94a3b8' },
]
export const DEFAULT_SETTINGS: AppSettings = { density: 'comfortable', confirmDelete: false, reminders: false, sound: true, leapDayPolicy: 'feb28' }
export const DEFAULT_DATA: AppData = { version: 2, tasks: [], categories: DEFAULT_CATEGORIES, birthdays: [], routines: [], settings: DEFAULT_SETTINGS }
export const STORAGE_KEY = 'doneday-v1'
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return localDate(d) }
export const timeNow = (date = new Date()) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(new Date(`${value}T12:00:00`)) === value
const validTime = (value: unknown): value is string => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
const offsets: ReminderOffset[] = [0, 5, 10, 30, 60, 1440]
const birthdayReminderOffsets: BirthdayReminderOffset[] = [3, 1, 0]
const priorityValues: Priority[] = ['low', 'medium', 'high', 'urgent']
const recurrenceValues: Recurrence[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'selected-days']
const parseAlarm = (value: unknown): AlarmConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const alarm = value as Partial<AlarmConfig>
  if (alarm.mode !== 'notification' && alarm.mode !== 'smart') return undefined
  return { mode: alarm.mode, enabled: alarm.enabled !== false, ringtone: alarm.ringtone === 'notification' || alarm.ringtone === 'ringtone' ? alarm.ringtone : 'alarm', vibrate: alarm.vibrate !== false, snoozeMinutes: [5, 10, 15, 30].includes(alarm.snoozeMinutes as number) ? alarm.snoozeMinutes as AlarmConfig['snoozeMinutes'] : 10, timezone: typeof alarm.timezone === 'string' && alarm.timezone.trim() ? alarm.timezone.trim().slice(0, 80) : Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' }
}

export const isOverdue = (task: Task, today = localDate(), now = new Date()) => {
  if (task.completed || !task.dueDate) return false
  if (task.dueDate < today) return true
  if (task.dueDate > today || !task.dueTime) return false
  return task.dueTime < timeNow(now)
}

export const createTask = (fields: Partial<Task> & Pick<Task, 'title'>, now = new Date()): Task => {
  const timestamp = now.toISOString()
  return { description: '', completed: false, createdAt: timestamp, updatedAt: timestamp, dueDate: '', dueTime: '', priority: 'medium', categoryId: 'personal', tags: [], reminder: false, reminderOffsets: [0], snoozeUntil: '', recurrence: 'none', recurrenceDays: [], subtasks: [], notes: '', completedAt: '', order: Date.now(), ...fields, title: fields.title.trim(), id: fields.id || crypto.randomUUID() }
}

export function nextRecurrenceDate(date: string, recurrence: Recurrence, recurrenceDays: number[] = []): string {
  const start = date || localDate()
  if (recurrence === 'daily') return addDays(start, 1)
  if (recurrence === 'weekly') return addDays(start, 7)
  if (recurrence === 'monthly') { const d = new Date(`${start}T12:00:00`); d.setMonth(d.getMonth() + 1); return localDate(d) }
  if (recurrence === 'weekdays' || recurrence === 'selected-days') {
    let next = addDays(start, 1); const days = recurrence === 'weekdays' ? [1, 2, 3, 4, 5] : recurrenceDays
    while (!days.includes(new Date(`${next}T12:00:00`).getDay())) next = addDays(next, 1)
    return next
  }
  return ''
}

export const periodForTime = (time: string): Routine['period'] => !time || time < '12:00' ? 'morning' : time < '17:00' ? 'afternoon' : 'evening'
export const taskReminderTimes = (task: Task) => {
  if (!task.reminder || !task.dueDate || !task.dueTime || task.completed) return []
  const base = new Date(`${task.dueDate}T${task.dueTime}:00`).getTime()
  return task.reminderOffsets.map(offset => ({ offset, at: new Date(base - offset * 60000) })).filter(item => !Number.isNaN(item.at.getTime()))
}
export const reminderKey = (task: Task, offset: number, at: Date) => `doneday-notified:${task.id}:${offset}:${at.toISOString().slice(0, 16)}`
export const snoozeTask = (task: Task, minutes: number, now = new Date()) => ({ ...task, snoozeUntil: new Date(now.getTime() + minutes * 60000).toISOString(), updatedAt: now.toISOString() })

export const birthdayDateInYear = (birthday: Birthday, year: number, policy: AppSettings['leapDayPolicy'] = 'feb28') => {
  const leap = new Date(year, 1, 29).getMonth() === 1
  if (birthday.month === 2 && birthday.day === 29 && !leap) return policy === 'mar1' ? new Date(year, 2, 1, 12) : new Date(year, 1, 28, 12)
  return new Date(year, birthday.month - 1, birthday.day, 12)
}
export const normalizeBirthdayReminderOffsets = (value: unknown): BirthdayReminderOffset[] => {
  const selected = Array.isArray(value) ? new Set(value.filter((offset): offset is BirthdayReminderOffset => offset === 0 || offset === 1 || offset === 3)) : new Set<BirthdayReminderOffset>()
  return birthdayReminderOffsets.filter(offset => selected.has(offset))
}
export const birthdayReminderTimes = (birthday: Birthday, now = new Date(), policy: AppSettings['leapDayPolicy'] = 'feb28') => {
  const [hours, minutes] = birthday.reminderTime.split(':').map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return []
  return birthday.reminderOffsets.map(offset => {
    const at = nextBirthday(birthday, now, policy)
    at.setHours(hours, minutes, 0, 0)
    at.setDate(at.getDate() - offset)
    return { offset, at }
  })
}
export const nextBirthday = (birthday: Birthday, now = new Date(), policy: AppSettings['leapDayPolicy'] = 'feb28') => { const date = birthdayDateInYear(birthday, now.getFullYear(), policy); return date.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() ? birthdayDateInYear(birthday, now.getFullYear() + 1, policy) : date }
export const birthdayDaysAway = (birthday: Birthday, now = new Date(), policy: AppSettings['leapDayPolicy'] = 'feb28') => { const next = nextBirthday(birthday, now, policy); return Math.round((new Date(next.getFullYear(), next.getMonth(), next.getDate()).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86400000) }
export const birthdayAge = (birthday: Birthday, now = new Date(), policy: AppSettings['leapDayPolicy'] = 'feb28') => birthday.year ? nextBirthday(birthday, now, policy).getFullYear() - birthday.year : undefined

export function parseData(raw: string): AppData {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as { tasks?: unknown }).tasks) || !Array.isArray((parsed as { categories?: unknown }).categories)) throw new Error('This file does not contain a valid DoneDay backup.')
  const data = parsed as Partial<AppData> & { tasks: unknown[]; categories: unknown[] }
  const categories = data.categories.filter((c): c is Category => !!c && typeof c === 'object' && typeof (c as Category).id === 'string' && typeof (c as Category).name === 'string').map(c => ({ id: c.id.trim().slice(0, 80), name: c.name.trim().slice(0, 50), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#94a3b8' })).filter(c => c.id && c.name)
  const safeCategories = (categories.length ? categories : DEFAULT_CATEGORIES).map(c => ({ ...c })); const categoryIds = new Set(safeCategories.map(c => c.id)); const usedIds = new Set<string>(); const timestamp = new Date().toISOString()
  const tasks = data.tasks.filter((t): t is Task => !!t && typeof t === 'object' && typeof (t as Task).title === 'string' && (t as Task).title.trim().length > 0).map((t, index) => {
    let id = typeof t.id === 'string' && t.id.trim() ? t.id.trim().slice(0, 100) : crypto.randomUUID(); if (usedIds.has(id)) id = crypto.randomUUID(); usedIds.add(id)
    const subtasks = Array.isArray(t.subtasks) ? t.subtasks.filter((s): s is Subtask => !!s && typeof s.title === 'string' && !!s.title.trim()).slice(0, 100).map(s => ({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 100) : crypto.randomUUID(), title: s.title.trim().slice(0, 120), completed: s.completed === true })) : []
    return { ...createTask({ title: t.title! }), ...t, id, title: t.title!.trim().slice(0, 160), description: typeof t.description === 'string' ? t.description.slice(0, 1000) : '', notes: typeof t.notes === 'string' ? t.notes.slice(0, 2000) : '', completed: t.completed === true, completedAt: validTimestamp(t.completedAt) ? t.completedAt : '', createdAt: validTimestamp(t.createdAt) ? t.createdAt : timestamp, updatedAt: validTimestamp(t.updatedAt) ? t.updatedAt : timestamp, dueDate: validDate(t.dueDate) ? t.dueDate : '', dueTime: validTime(t.dueTime) ? t.dueTime : '', priority: priorityValues.includes(t.priority as Priority) ? t.priority as Priority : 'medium', categoryId: categoryIds.has(t.categoryId ?? '') ? t.categoryId! : safeCategories[0].id, tags: Array.isArray(t.tags) ? t.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().replace(/^#/, '').slice(0, 40)).filter(Boolean).slice(0, 30) : [], reminder: t.reminder === true, reminderOffsets: Array.isArray(t.reminderOffsets) ? t.reminderOffsets.filter((n): n is ReminderOffset => offsets.includes(n as ReminderOffset)) : [0], snoozeUntil: validTimestamp(t.snoozeUntil) ? t.snoozeUntil : '', recurrence: recurrenceValues.includes(t.recurrence as Recurrence) ? t.recurrence as Recurrence : 'none', recurrenceDays: Array.isArray(t.recurrenceDays) ? t.recurrenceDays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6) : [], subtasks, order: typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : index, alarm: parseAlarm(t.alarm) }
  }) as Task[]
  const birthdays = (Array.isArray(data.birthdays) ? data.birthdays.filter((b): b is Birthday => !!b && typeof b === 'object' && typeof (b as Birthday).name === 'string' && !!(b as Birthday).name.trim()).map(b => ({ id: typeof b.id === 'string' && b.id ? b.id.slice(0, 100) : crypto.randomUUID(), name: b.name!.trim().slice(0, 120), month: Number.isInteger(b.month) && b.month! >= 1 && b.month! <= 12 ? b.month! : 1, day: Number.isInteger(b.day) && b.day! >= 1 && b.day! <= 31 ? b.day! : 1, year: Number.isInteger(b.year) && b.year! >= 1900 && b.year! <= 3000 ? b.year : undefined, relationship: ['Family', 'Friend', 'Partner', 'Colleague', 'Other'].includes(b.relationship ?? '') ? b.relationship as BirthdayRelationship : 'Other', notes: typeof b.notes === 'string' ? b.notes.slice(0, 1000) : '', giftIdeas: typeof b.giftIdeas === 'string' ? b.giftIdeas.slice(0, 1000) : '', photo: typeof b.photo === 'string' && b.photo.startsWith('data:image/') && b.photo.length < 800000 ? b.photo : '', reminderOffsets: Array.isArray(b.reminderOffsets) ? normalizeBirthdayReminderOffsets(b.reminderOffsets) : [0], reminderTime: validTime(b.reminderTime) ? b.reminderTime : '09:00', createdAt: validTimestamp(b.createdAt) ? b.createdAt : timestamp, updatedAt: validTimestamp(b.updatedAt) ? b.updatedAt : timestamp, alarm: parseAlarm(b.alarm) })).filter(b => new Date(2024, b.month - 1, b.day).getMonth() === b.month - 1) : []) as Birthday[]
  const routines = (Array.isArray(data.routines) ? data.routines.filter((r): r is Routine => !!r && typeof r === 'object' && typeof (r as Routine).title === 'string' && !!(r as Routine).title.trim()).map(r => ({ id: typeof r.id === 'string' && r.id ? r.id : crypto.randomUUID(), title: r.title!.trim().slice(0, 120), time: validTime(r.time) ? r.time : '', period: ['morning', 'afternoon', 'evening'].includes(r.period ?? '') ? r.period as Routine['period'] : periodForTime(r.time ?? ''), recurrence: ['daily', 'weekdays', 'weekly', 'monthly', 'selected-days'].includes(r.recurrence ?? '') ? r.recurrence as Routine['recurrence'] : 'daily', recurrenceDays: Array.isArray(r.recurrenceDays) ? r.recurrenceDays.filter((n): n is number => Number.isInteger(n) && n >= 0 && n <= 6) : [], completedDates: Array.isArray(r.completedDates) ? r.completedDates.filter(validDate).slice(-365) : [], createdAt: validTimestamp(r.createdAt) ? r.createdAt : timestamp })) : []) as Routine[]
  const setting = data.settings && typeof data.settings === 'object' ? data.settings as Partial<AppSettings> : {}
  return { version: 2, tasks, categories: safeCategories, birthdays, routines, settings: { density: setting.density === 'compact' ? 'compact' : 'comfortable', confirmDelete: setting.confirmDelete === true, reminders: setting.reminders === true, sound: setting.sound !== false, leapDayPolicy: setting.leapDayPolicy === 'mar1' ? 'mar1' : 'feb28' } }
}
