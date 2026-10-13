import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DATA, createTask, type AppData } from '../src/domain'

const calls: Array<{ table: string; method: string; payload?: unknown; ids?: unknown }> = []
const fakeClient = {
  from(table: string) {
    return {
      upsert: async (payload: unknown) => { calls.push({ table, method: 'upsert', payload }); return { error: null } },
      update(payload: unknown) {
        calls.push({ table, method: 'update', payload })
        return {
          eq() { return { in: async (_column: string, ids: unknown) => { calls[calls.length - 1].ids = ids; return { error: null } } } },
        }
      },
    }
  },
}

vi.mock('../src/supabase', () => ({ cloudConfigured: true, supabase: fakeClient }))

const { describeCloudError, uploadCloudData } = await import('../src/cloud')

describe('cloud sync safeguards', () => {
  beforeEach(() => { calls.length = 0 })

  it('turns a denied cloud request into an actionable, safe message', () => {
    expect(describeCloudError({ code: '42501', message: 'permission denied for table tasks' }).message).toMatch(/Supabase access migration/i)
  })

  it('upserts active records and only tombstones records known to have been synced before', async () => {
    const task = createTask({ id: 'keep', title: 'Updated task' })
    const deletedTask = createTask({ id: 'remove', title: 'Removed task' })
    const current: AppData = { ...DEFAULT_DATA, tasks: [task], birthdays: [] }
    const previous: AppData = { ...DEFAULT_DATA, tasks: [task, deletedTask], birthdays: [] }

    await uploadCloudData('user-1', current, previous)

    const taskUpsert = calls.find(call => call.table === 'tasks' && call.method === 'upsert')
    expect(taskUpsert?.payload).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'user-1:keep', deleted_at: null })]))
    const taskDelete = calls.find(call => call.table === 'tasks' && call.method === 'update')
    expect(taskDelete).toMatchObject({ payload: expect.objectContaining({ deleted_at: expect.any(String) }), ids: ['user-1:remove'] })
  })

  it('keeps per-user RLS and grants the authenticated browser role the table permissions it needs', () => {
    const initialMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202610120001_doneday_cloud.sql'), 'utf8')
    const accessMigration = readFileSync(resolve(process.cwd(), 'supabase/migrations/202610130002_grant_authenticated_cloud_access.sql'), 'utf8')
    expect(initialMigration).toContain('using (user_id = auth.uid())')
    expect(accessMigration).toMatch(/grant select, insert, update, delete on table[\s\S]*public\.tasks[\s\S]*to authenticated/i)
  })
})
