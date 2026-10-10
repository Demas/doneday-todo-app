export type Priority = 'low' | 'medium' | 'high' | 'urgent'
export type Recurrence = 'none' | 'daily' | 'weekdays' | 'weekly'
export type Subtask = { id: string; title: string; completed: boolean }
export type Task = {
  id: string; title: string; description: string; completed: boolean; createdAt: string; updatedAt: string
  dueDate: string; dueTime: string; priority: Priority; categoryId: string; tags: string[]
  reminder: boolean; recurrence: Recurrence; subtasks: Subtask[]; notes: string; completedAt: string; order: number
}
export type Category = { id: string; name: string; color: string }
export type AppData = { tasks: Task[]; categories: Category[]; settings: { density: 'comfortable' | 'compact'; confirmDelete: boolean; reminders: boolean } }

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'personal', name: 'Personal', color: '#facc15' }, { id: 'work', name: 'Work', color: '#7c9cf5' },
  { id: 'shopping', name: 'Shopping', color: '#f4a261' }, { id: 'study', name: 'Study', color: '#a78bfa' },
  { id: 'other', name: 'Other', color: '#94a3b8' },
]
export const DEFAULT_DATA: AppData = { tasks: [], categories: DEFAULT_CATEGORIES, settings: { density: 'comfortable', confirmDelete: false, reminders: false } }
export const STORAGE_KEY = 'doneday-v1'
export const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const addDays = (date: string, days: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return localDate(d) }
export const isOverdue = (task: Task, today = localDate(), now = new Date()) => {
  if (task.completed || !task.dueDate) return false
  if (task.dueDate < today) return true
  if (task.dueDate > today || !task.dueTime) return false
  const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return task.dueTime < currentTime
}
export const createTask = (fields: Partial<Task> & Pick<Task, 'title'>, now = new Date()): Task => {
  const timestamp = now.toISOString()
  return { description: '', completed: false, createdAt: timestamp, updatedAt: timestamp, dueDate: '', dueTime: '', priority: 'medium', categoryId: 'personal', tags: [], reminder: false, recurrence: 'none', subtasks: [], notes: '', completedAt: '', order: Date.now(), ...fields, title: fields.title.trim(), id: fields.id || crypto.randomUUID() }
}
export function nextRecurrenceDate(date: string, recurrence: Recurrence): string {
  if (recurrence === 'daily') return addDays(date || localDate(), 1)
  if (recurrence === 'weekly') return addDays(date || localDate(), 7)
  if (recurrence === 'weekdays') { let next = addDays(date || localDate(), 1); while ([0, 6].includes(new Date(`${next}T12:00:00`).getDay())) next = addDays(next, 1); return next }
  return ''
}
export function parseData(raw: string): AppData {
  const parsed: unknown = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray((parsed as AppData).tasks) || !Array.isArray((parsed as AppData).categories)) throw new Error('This file does not contain a valid DoneDay backup.')
  const data = parsed as AppData
  const importedCategories = data.categories.filter(c => c && typeof c.id === 'string' && typeof c.name === 'string').map(c => ({ id: c.id.trim().slice(0, 80), name: c.name.trim().slice(0, 50), color: typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#94a3b8' })).filter(c => c.id && c.name)
  const categories = (importedCategories.length ? importedCategories : DEFAULT_CATEGORIES).map(c => ({ ...c }))
  const categoryIds = new Set(categories.map(c => c.id))
  const usedIds = new Set<string>()
  const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && localDate(new Date(`${value}T12:00:00`)) === value
  const validTimestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value))
  const priorities: Priority[] = ['low', 'medium', 'high', 'urgent']
  const recurrences: Recurrence[] = ['none', 'daily', 'weekdays', 'weekly']
  const tasks = data.tasks.filter((t): t is Task => !!t && typeof t === 'object' && typeof t.title === 'string' && t.title.trim().length > 0).map((t, index) => {
    const timestamp = new Date().toISOString()
    let id = typeof t.id === 'string' && t.id.trim() ? t.id.trim().slice(0, 100) : crypto.randomUUID()
    if (usedIds.has(id)) id = crypto.randomUUID()
    usedIds.add(id)
    const subtasks = Array.isArray(t.subtasks) ? t.subtasks.filter(s => s && typeof s.title === 'string' && s.title.trim()).slice(0, 100).map(s => ({ id: typeof s.id === 'string' && s.id ? s.id.slice(0, 100) : crypto.randomUUID(), title: s.title.trim().slice(0, 120), completed: s.completed === true })) : []
    return {
      ...createTask({ title: t.title }), ...t, id, title: t.title.trim().slice(0, 160),
      description: typeof t.description === 'string' ? t.description.slice(0, 1000) : '',
      notes: typeof t.notes === 'string' ? t.notes.slice(0, 2000) : '',
      completed: t.completed === true, completedAt: validTimestamp(t.completedAt) ? t.completedAt : '',
      createdAt: validTimestamp(t.createdAt) ? t.createdAt : timestamp,
      updatedAt: validTimestamp(t.updatedAt) ? t.updatedAt : timestamp,
      dueDate: validDate(t.dueDate) ? t.dueDate : '',
      dueTime: typeof t.dueTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t.dueTime) ? t.dueTime : '',
      priority: priorities.includes(t.priority) ? t.priority : 'medium',
      categoryId: categoryIds.has(t.categoryId) ? t.categoryId : categories[0].id,
      tags: Array.isArray(t.tags) ? t.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().replace(/^#/, '').slice(0, 40)).filter(Boolean).slice(0, 30) : [],
      reminder: t.reminder === true,
      recurrence: recurrences.includes(t.recurrence) ? t.recurrence : 'none',
      subtasks,
      order: typeof t.order === 'number' && Number.isFinite(t.order) ? t.order : index,
    }
  })
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : DEFAULT_DATA.settings
  return { tasks, categories, settings: { density: settings.density === 'compact' ? 'compact' : 'comfortable', confirmDelete: settings.confirmDelete === true, reminders: settings.reminders === true } }
}
