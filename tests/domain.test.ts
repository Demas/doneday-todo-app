import { describe, expect, it } from 'vitest'
import { createTask, isOverdue, nextRecurrenceDate, parseData } from '../src/domain'

describe('task data helpers', () => {
  it('creates a normalized task with safe defaults', () => {
    const task = createTask({ title: '  Plan the week  ' })
    expect(task.title).toBe('Plan the week')
    expect(task.completed).toBe(false)
    expect(task.priority).toBe('medium')
    expect(task.subtasks).toEqual([])
  })

  it('identifies overdue pending tasks but ignores completed tasks', () => {
    const now = new Date('2026-10-08T14:00:00')
    expect(isOverdue(createTask({ title: 'Late', dueDate: '2026-10-07' }), '2026-10-08', now)).toBe(true)
    expect(isOverdue(createTask({ title: 'Done', dueDate: '2026-10-07', completed: true }), '2026-10-08', now)).toBe(false)
    expect(isOverdue(createTask({ title: 'Today', dueDate: '2026-10-08' }), '2026-10-08', now)).toBe(false)
    expect(isOverdue(createTask({ title: 'Past due time', dueDate: '2026-10-08', dueTime: '13:30' }), '2026-10-08', now)).toBe(true)
    expect(isOverdue(createTask({ title: 'Later today', dueDate: '2026-10-08', dueTime: '15:30' }), '2026-10-08', now)).toBe(false)
  })

  it('calculates daily, weekly, and weekday recurrence dates in local calendar days', () => {
    expect(nextRecurrenceDate('2026-10-08', 'daily')).toBe('2026-10-09')
    expect(nextRecurrenceDate('2026-10-08', 'weekly')).toBe('2026-10-15')
    expect(nextRecurrenceDate('2026-10-09', 'weekdays')).toBe('2026-10-12')
  })

  it('validates and sanitizes imported data', () => {
    const imported = parseData(JSON.stringify({ tasks: [{ id: 'x', title: '  Imported  ', dueDate: 'not-a-date', dueTime: '99:99', priority: 'explosive', recurrence: 'hourly', completed: 'yes', reminder: 1, tags: ['ok', 2] }, { id: 4, title: '' }], categories: [{ id: 'a', name: 'Work', color: 'bad' }] }))
    expect(imported.tasks).toHaveLength(1)
    expect(imported.tasks[0].title).toBe('Imported')
    expect(imported.tasks[0].tags).toEqual(['ok'])
    expect(imported.tasks[0].dueDate).toBe('')
    expect(imported.tasks[0].dueTime).toBe('')
    expect(imported.tasks[0].priority).toBe('medium')
    expect(imported.tasks[0].recurrence).toBe('none')
    expect(imported.tasks[0].completed).toBe(false)
    expect(imported.categories[0].color).toBe('#94a3b8')
    expect(parseData('{"tasks":[],"categories":[]}').categories.length).toBeGreaterThan(0)
    expect(() => parseData('{"tasks":[]}')).toThrow()
  })
})
