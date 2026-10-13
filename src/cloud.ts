import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { AppData, Birthday, Category, Routine, Task } from './domain'
import { parseData } from './domain'
import { cloudConfigured, supabase } from './supabase'
import { cleanDisplayName } from './personalization'

export type CloudStatus = 'guest' | 'loading' | 'synced' | 'syncing' | 'error'
export type UserProfile = { displayName: string; email: string; timezone: string }
export type CloudSyncIssue = { operation: string; message: string }
const importedKey = (userId: string) => `doneday-cloud-imported:${userId}`
const snapshot = (data: AppData) => JSON.stringify(data)
const cloudId = (userId: string, localId: string) => `${userId}:${localId}`

function mergeById<T extends { id: string; updatedAt?: string }>(remote: T[], local: T[]): T[] {
  const merged = new Map(remote.map(item => [item.id, item]))
  for (const item of local) {
    const existing = merged.get(item.id)
    const localUpdated = Date.parse(item.updatedAt ?? '') || 0
    const remoteUpdated = Date.parse(existing?.updatedAt ?? '') || 0
    if (!existing || localUpdated >= remoteUpdated) merged.set(item.id, item)
  }
  return [...merged.values()]
}

function mergeCloudData(remote: AppData, local: AppData): AppData {
  return {
    version: 2,
    tasks: mergeById(remote.tasks, local.tasks),
    categories: mergeById(remote.categories, local.categories),
    birthdays: mergeById(remote.birthdays, local.birthdays),
    routines: mergeById(remote.routines, local.routines),
    settings: { ...remote.settings, ...local.settings },
  }
}

type SupabaseErrorLike = { code?: unknown; message?: unknown; status?: unknown }

function cloudError(operation: string, error: unknown): Error & { operation: string } {
  const source = (error && typeof error === 'object' ? error : {}) as SupabaseErrorLike
  const message = typeof source.message === 'string' ? source.message : ''
  const code = typeof source.code === 'string' ? source.code : ''
  const status = typeof source.status === 'number' ? source.status : 0
  let safeMessage = `Could not ${operation}. Retry sync in a moment.`
  if (code === '42501' || /permission denied|row-level security/i.test(message)) safeMessage = `DoneDay cannot access its cloud data while ${operation}. Apply the Supabase access migration, then retry.`
  else if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message)) safeMessage = `DoneDay’s cloud tables are unavailable while ${operation}. Apply the Supabase migrations, then retry.`
  else if (status === 401 || /jwt|session|not authenticated/i.test(message)) safeMessage = 'Your session needs to be refreshed. Sign in again, then retry sync.'
  else if (/network|fetch|failed to fetch|timeout/i.test(message)) safeMessage = 'DoneDay could not reach cloud sync. Check your connection, then retry.'
  const wrapped = new Error(safeMessage) as Error & { operation: string }
  wrapped.operation = operation
  return wrapped
}

export function describeCloudError(error: unknown): CloudSyncIssue {
  if (error && typeof error === 'object' && 'operation' in error && error instanceof Error) return { operation: String(error.operation), message: error.message }
  return { operation: 'sync your cloud data', message: cloudError('sync your cloud data', error).message }
}

async function fetchCloudData(userId: string): Promise<AppData | null> {
  if (!supabase) return null
  const read = async (operation: string, request: PromiseLike<{ data: unknown; error: unknown }>) => {
    const result = await request
    if (result.error) throw cloudError(operation, result.error)
    return result.data
  }
  const [taskRows, categoryRows, birthdayRows, routineRows, settingsRow] = await Promise.all([
    read('read tasks', supabase.from('tasks').select('*').eq('user_id', userId).is('deleted_at', null)),
    read('read categories', supabase.from('categories').select('*').eq('user_id', userId).is('deleted_at', null)),
    read('read birthdays', supabase.from('birthdays').select('*').eq('user_id', userId).is('deleted_at', null)),
    read('read routines', supabase.from('routines').select('*').eq('user_id', userId).is('deleted_at', null)),
    read('read settings', supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle()),
  ])
  const tasks = (taskRows ?? []) as Array<{ data: unknown }>
  const categories = (categoryRows ?? []) as Array<{ data: unknown }>
  const birthdays = (birthdayRows ?? []) as Array<{ data: unknown }>
  const routines = (routineRows ?? []) as Array<{ data: unknown }>
  const settings = settingsRow as { data?: unknown } | null
  if (!tasks.length && !birthdays.length && !routines.length && !categories.length) return null
  const data = {
    version: 2,
    tasks: tasks.map(row => row.data as Task),
    categories: categories.map(row => row.data as Category),
    birthdays: birthdays.map(row => row.data as Birthday),
    routines: routines.map(row => row.data as Routine),
    settings: settings?.data ?? {},
  }
  return parseData(JSON.stringify(data))
}

export async function uploadCloudData(userId: string, data: AppData, previous: AppData | null = null) {
  if (!supabase) throw new Error('Cloud setup is incomplete.')
  const client = supabase
  const timestamp = new Date().toISOString()
  const write = async (table: string, records: Array<Record<string, unknown>>) => {
    if (!records.length) return
    const { error } = await client.from(table).upsert(records, { onConflict: 'id' })
    if (error) throw cloudError(`save ${table}`, error)
  }
  await write('categories', data.categories.map(category => ({ id: cloudId(userId, category.id), user_id: userId, name: category.name, color: category.color, data: category, deleted_at: null, updated_at: timestamp })))
  await write('tasks', data.tasks.map(task => ({ id: cloudId(userId, task.id), user_id: userId, title: task.title, description: task.description, due_date: task.dueDate || null, due_time: task.dueTime || null, priority: task.priority, category_id: task.categoryId ? cloudId(userId, task.categoryId) : null, completed: task.completed, completed_at: task.completedAt || null, recurrence: task.recurrence, data: task, deleted_at: null, updated_at: timestamp })))
  await write('birthdays', data.birthdays.map(birthday => ({ id: cloudId(userId, birthday.id), user_id: userId, name: birthday.name, month: birthday.month, day: birthday.day, year: birthday.year ?? null, data: birthday, deleted_at: null, updated_at: timestamp })))
  await write('routines', data.routines.map(routine => ({ id: cloudId(userId, routine.id), user_id: userId, title: routine.title, data: routine, deleted_at: null, updated_at: timestamp })))
  const { error } = await client.from('user_settings').upsert({ user_id: userId, data: data.settings, updated_at: timestamp }, { onConflict: 'user_id' })
  if (error) throw cloudError('save settings', error)

  const markRemoved = async <T extends { id: string }>(table: string, current: T[], before: T[]) => {
    const currentIds = new Set(current.map(record => record.id))
    const removedIds = before.filter(record => !currentIds.has(record.id)).map(record => cloudId(userId, record.id))
    if (!removedIds.length) return
    const { error: removeError } = await client.from(table).update({ deleted_at: timestamp, updated_at: timestamp }).eq('user_id', userId).in('id', removedIds)
    if (removeError) throw cloudError(`remove ${table}`, removeError)
  }
  if (previous) {
    await markRemoved('tasks', data.tasks, previous.tasks)
    await markRemoved('birthdays', data.birthdays, previous.birthdays)
    await markRemoved('routines', data.routines, previous.routines)
    await markRemoved('categories', data.categories, previous.categories)
  }
}

export function useCloudSync(data: AppData, setData: Dispatch<SetStateAction<AppData>>) {
  const [status, setStatus] = useState<CloudStatus>(cloudConfigured ? 'loading' : 'guest')
  const [authReady, setAuthReady] = useState(!cloudConfigured)
  const [userId, setUserId] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile>({ displayName: '', email: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
  const [syncIssue, setSyncIssue] = useState<CloudSyncIssue | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [importRequired, setImportRequired] = useState(false)
  const last = useRef('')
  const lastSyncedData = useRef<AppData | null>(null)
  const initialised = useRef(false)

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return }
    const client = supabase
    let active = true
    const loadProfile = async (id: string) => {
      const [{ data: auth, error: authError }, { data: row, error: profileError }] = await Promise.all([client.auth.getUser(), client.from('profiles').select('display_name, timezone').eq('id', id).maybeSingle()])
      if (!active) return
      if (authError || profileError) setSyncIssue(describeCloudError(cloudError('load your profile', authError || profileError)))
      setProfile({ displayName: cleanDisplayName(row?.display_name) || cleanDisplayName(auth.user?.user_metadata.display_name), email: auth.user?.email ?? '', timezone: row?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
    }
    const load = async () => {
      try {
        const { data: auth, error } = await client.auth.getUser()
        if (!active) return
        if (error) {
          setSyncIssue(describeCloudError(cloudError('check your session', error)))
          setUserId(null); setStatus('guest'); setAuthReady(true)
          return
        }
        setUserId(auth.user?.id ?? null)
        if (auth.user) {
          void client.from('profiles').upsert({ id: auth.user.id, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', updated_at: new Date().toISOString() }, { onConflict: 'id' }).then(({ error: profileError }) => {
            if (profileError && active) setSyncIssue(describeCloudError(cloudError('create your profile', profileError)))
          })
          void loadProfile(auth.user.id)
        }
        setStatus(auth.user ? 'loading' : 'guest'); setAuthReady(true)
      } catch (error) {
        if (!active) return
        setSyncIssue(describeCloudError(cloudError('check your session', error)))
        setUserId(null); setStatus('guest'); setAuthReady(true)
      }
    }
    void load()
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      initialised.current = false; last.current = ''; lastSyncedData.current = null; setSyncIssue(null); setImportRequired(false)
      setUserId(session?.user.id ?? null); setStatus(session?.user ? 'loading' : 'guest'); setAuthReady(true)
      if (session?.user) void loadProfile(session.user.id); else setProfile({ displayName: '', email: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' })
    })
    const refresh = () => { if (userId) void loadProfile(userId); else void client.auth.getUser().then(({ data }) => { if (data.user) void loadProfile(data.user.id) }) }
    window.addEventListener('doneday-profile-updated', refresh)
    return () => { active = false; listener.subscription.unsubscribe(); window.removeEventListener('doneday-profile-updated', refresh) }
  }, [])

  useEffect(() => {
    if (!supabase || !userId || initialised.current) return
    let active = true
    void (async () => {
      try {
        const remote = await fetchCloudData(userId)
        if (!active) return
        initialised.current = true
        if (remote) {
          const merged = mergeCloudData(remote, data)
          const localItemsNeedImport = (data.tasks.length > 0 || data.birthdays.length > 0 || data.routines.length > 0) && snapshot(merged) !== snapshot(remote)
          last.current = snapshot(remote); lastSyncedData.current = remote; setData(localItemsNeedImport ? merged : remote); setImportRequired(localItemsNeedImport); setStatus('synced'); setSyncIssue(null)
          if (localItemsNeedImport && !localStorage.getItem(importedKey(userId))) window.dispatchEvent(new CustomEvent('doneday-cloud-import-offer'))
        }
        else if (data.tasks.length || data.birthdays.length || data.routines.length) {
          lastSyncedData.current = null; setImportRequired(true); setStatus('synced'); setSyncIssue(null)
          if (!localStorage.getItem(importedKey(userId))) window.dispatchEvent(new CustomEvent('doneday-cloud-import-offer'))
        } else { last.current = snapshot(data); lastSyncedData.current = data; setStatus('synced'); setSyncIssue(null) }
      } catch (error) { if (active) { setSyncIssue(describeCloudError(error)); setStatus('error') } }
    })()
    return () => { active = false }
  }, [userId, data.tasks.length, data.birthdays.length, data.routines.length, retryVersion, setData])

  useEffect(() => {
    if (!supabase || !userId) return
    const client = supabase
    const channel = client.channel(`doneday-profile-${userId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` }, payload => {
      const next = payload.new as { display_name?: unknown; timezone?: unknown }
      setProfile(current => ({ ...current, displayName: cleanDisplayName(next.display_name) || current.displayName, timezone: typeof next.timezone === 'string' && next.timezone ? next.timezone : current.timezone }))
    }).subscribe()
    return () => { void client.removeChannel(channel) }
  }, [userId])

  useEffect(() => {
    if (!supabase || !userId || !initialised.current || status === 'error' || importRequired) return
    const next = snapshot(data)
    if (next === last.current) return
    const timer = window.setTimeout(() => void (async () => {
      try { setStatus('syncing'); await uploadCloudData(userId, data, lastSyncedData.current); last.current = next; lastSyncedData.current = data; setStatus('synced'); setSyncIssue(null) }
      catch (error) { setSyncIssue(describeCloudError(error)); setStatus('error') }
    })(), 700)
    return () => window.clearTimeout(timer)
  }, [data, status, userId])

  const importLocal = async () => {
    if (!userId) return
    try { setStatus('syncing'); await uploadCloudData(userId, data, lastSyncedData.current); localStorage.setItem(importedKey(userId), 'true'); last.current = snapshot(data); lastSyncedData.current = data; setImportRequired(false); setStatus('synced'); setSyncIssue(null) }
    catch (error) { setSyncIssue(describeCloudError(error)); setStatus('error'); throw error }
  }
  const retry = () => { if (!userId || status === 'syncing') return; initialised.current = false; setSyncIssue(null); setStatus('loading'); setRetryVersion(version => version + 1) }
  return { status, authReady, userId, profile, syncIssue, importLocal, retry }
}
