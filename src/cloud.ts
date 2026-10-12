import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AppData, Birthday, Category, Routine, Task } from './domain'
import { parseData } from './domain'
import { cloudConfigured, supabase } from './supabase'

export type CloudStatus = 'guest' | 'loading' | 'synced' | 'syncing' | 'error'
const importedKey = (userId: string) => `doneday-cloud-imported:${userId}`
const snapshot = (data: AppData) => JSON.stringify(data)
const cloudId = (userId: string, localId: string) => `${userId}:${localId}`

async function fetchCloudData(userId: string): Promise<AppData | null> {
  if (!supabase) return null
  const [tasks, categories, birthdays, routines, settings] = await Promise.all([
    supabase.from('tasks').select('*').eq('user_id', userId).is('deleted_at', null),
    supabase.from('categories').select('*').eq('user_id', userId).is('deleted_at', null),
    supabase.from('birthdays').select('*').eq('user_id', userId).is('deleted_at', null),
    supabase.from('routines').select('*').eq('user_id', userId).is('deleted_at', null),
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ])
  const error = [tasks, categories, birthdays, routines, settings].find(result => result.error)?.error
  if (error) throw error
  if (!tasks.data?.length && !birthdays.data?.length && !routines.data?.length && !categories.data?.length) return null
  const data = {
    version: 2,
    tasks: (tasks.data ?? []).map(row => row.data as Task),
    categories: (categories.data ?? []).map(row => row.data as Category),
    birthdays: (birthdays.data ?? []).map(row => row.data as Birthday),
    routines: (routines.data ?? []).map(row => row.data as Routine),
    settings: settings.data?.data ?? {},
  }
  return parseData(JSON.stringify(data))
}

export async function uploadCloudData(userId: string, data: AppData) {
  if (!supabase) throw new Error('Cloud setup is incomplete.')
  const client = supabase
  const timestamp = new Date().toISOString()
  const write = async (table: string, records: Array<Record<string, unknown>>) => {
    if (!records.length) return
    const { error } = await client.from(table).upsert(records, { onConflict: 'id' })
    if (error) throw error
  }
  await write('categories', data.categories.map(category => ({ id: cloudId(userId, category.id), user_id: userId, name: category.name, color: category.color, data: category, updated_at: timestamp })))
  await write('tasks', data.tasks.map(task => ({ id: cloudId(userId, task.id), user_id: userId, title: task.title, description: task.description, due_date: task.dueDate || null, due_time: task.dueTime || null, priority: task.priority, category_id: task.categoryId ? cloudId(userId, task.categoryId) : null, completed: task.completed, completed_at: task.completedAt || null, recurrence: task.recurrence, data: task, updated_at: timestamp })))
  await write('birthdays', data.birthdays.map(birthday => ({ id: cloudId(userId, birthday.id), user_id: userId, name: birthday.name, month: birthday.month, day: birthday.day, year: birthday.year ?? null, data: birthday, updated_at: timestamp })))
  await write('routines', data.routines.map(routine => ({ id: cloudId(userId, routine.id), user_id: userId, title: routine.title, data: routine, updated_at: timestamp })))
  const { error } = await client.from('user_settings').upsert({ user_id: userId, data: data.settings, updated_at: timestamp }, { onConflict: 'user_id' })
  if (error) throw error
}

export function useCloudSync(data: AppData, setData: Dispatch<SetStateAction<AppData>>) {
  const [status, setStatus] = useState<CloudStatus>(cloudConfigured ? 'loading' : 'guest')
  const [userId, setUserId] = useState<string | null>(null)
  const last = useRef('')
  const initialised = useRef(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let active = true
    const load = async () => {
      const { data: auth } = await client.auth.getUser()
      if (!active) return
      setUserId(auth.user?.id ?? null)
      if (auth.user) void client.from('profiles').upsert({ id: auth.user.id, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', updated_at: new Date().toISOString() }, { onConflict: 'id' })
      setStatus(auth.user ? 'loading' : 'guest')
    }
    void load()
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      initialised.current = false; last.current = ''
      setUserId(session?.user.id ?? null); setStatus(session?.user ? 'loading' : 'guest')
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !userId || initialised.current) return
    let active = true
    void (async () => {
      try {
        const remote = await fetchCloudData(userId)
        if (!active) return
        initialised.current = true
        if (remote) { last.current = snapshot(remote); setData(remote); setStatus('synced') }
        else if (data.tasks.length || data.birthdays.length || data.routines.length) {
          setStatus('synced')
          window.dispatchEvent(new CustomEvent('doneday-cloud-import-offer'))
        } else { last.current = snapshot(data); setStatus('synced') }
      } catch { if (active) setStatus('error') }
    })()
    return () => { active = false }
  }, [userId, data.tasks.length, data.birthdays.length, data.routines.length, setData])

  useEffect(() => {
    if (!supabase || !userId || !initialised.current || status === 'error') return
    const next = snapshot(data)
    if (next === last.current) return
    const timer = window.setTimeout(() => void (async () => {
      try { setStatus('syncing'); await uploadCloudData(userId, data); last.current = next; setStatus('synced') }
      catch { setStatus('error') }
    })(), 700)
    return () => window.clearTimeout(timer)
  }, [data, status, userId])

  const importLocal = async () => {
    if (!userId) return
    setStatus('syncing'); await uploadCloudData(userId, data); localStorage.setItem(importedKey(userId), 'true'); last.current = snapshot(data); setStatus('synced')
  }
  return { status, userId, importLocal }
}
