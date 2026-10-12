import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import { addDays, createTask, DEFAULT_DATA, localDate } from '../src/domain'

describe('DoneDay task workflow', () => {
  it('quick-adds a task, marks it complete, and keeps it visible on the dashboard', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Quick add task' }), { target: { value: 'Send the proposal' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Quick add task' }).closest('form')!)

    expect(screen.getByRole('button', { name: 'Send the proposal' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Complete Send the proposal' }))
    expect(screen.getByRole('button', { name: 'Mark Send the proposal incomplete' })).toBeInTheDocument()
  })

  it('searches dashboard tasks by title', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Quick add task' }), { target: { value: 'Book a dentist appointment' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Quick add task' }).closest('form')!)
    fireEvent.change(screen.getByPlaceholderText('Search anything…'), { target: { value: 'dentist' } })
    expect(screen.getByRole('button', { name: 'Book a dentist appointment' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search anything…'), { target: { value: 'gardening' } })
    expect(screen.queryByRole('button', { name: 'Book a dentist appointment' })).not.toBeInTheDocument()
  })

  it('edits, completes, restores, deletes, and undoes deletion while persisting changes', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Quick add task' }), { target: { value: 'Send the proposal' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Quick add task' }).closest('form')!)
    fireEvent.click(screen.getByRole('button', { name: 'Send the proposal' }))
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Send the signed proposal' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    fireEvent.click(screen.getByRole('button', { name: 'Complete Send the signed proposal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark Send the signed proposal incomplete' }))
    fireEvent.click(document.querySelector('.task-menu summary')!)
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Task deleted')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }))

    expect(screen.getByRole('button', { name: 'Send the signed proposal' })).toBeInTheDocument()
    expect(localStorage.getItem('doneday-v1')).toContain('Send the signed proposal')
  })

  it('creates subtasks and updates their completion progress', () => {
    render(<App />)
    fireEvent.click(document.querySelector('.header-add')!)
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Prepare for the trip' } })
    fireEvent.change(screen.getByLabelText(/Subtasks/), { target: { value: 'Pack bag\nBook a ride' } })
    fireEvent.click(document.querySelector('.dialog .btn.primary')!)
    fireEvent.click(screen.getByRole('button', { name: 'My Tasks' }))

    expect(screen.getByText('0/2 subtasks')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Pack bag'))
    expect(screen.getByText('1/2 subtasks')).toBeInTheDocument()
  })

  it('saves dates, times, priority, list and tags, then filters them in the overdue view', () => {
    render(<App />)
    fireEvent.click(document.querySelector('.header-add')!)
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Prepare release' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: addDays(localDate(), -1) } })
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '09:15' } })
    fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'urgent' } })
    fireEvent.change(screen.getByLabelText('List'), { target: { value: 'work' } })
    fireEvent.change(screen.getByPlaceholderText('home, important'), { target: { value: 'release, qa' } })
    fireEvent.click(document.querySelector('.dialog .btn.primary')!)
    fireEvent.click(screen.getAllByRole('button', { name: /Overdue/ })[0])

    expect(screen.getByRole('button', { name: 'Prepare release' })).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
    expect(document.querySelector('.category-chip')?.textContent).toContain('Work')
    expect(screen.getByText('#release')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter tasks'), { target: { value: 'low' } })
    expect(screen.queryByRole('button', { name: 'Prepare release' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter tasks'), { target: { value: 'high' } })
    expect(screen.getByRole('button', { name: 'Prepare release' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search anything…'), { target: { value: 'qa' } })
    expect(screen.getByRole('button', { name: 'Prepare release' })).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Search anything…'), { target: { value: 'not-a-tag' } })
    expect(screen.queryByRole('button', { name: 'Prepare release' })).not.toBeInTheDocument()
  })

  it('creates the next recurring occurrence and resets its subtasks', () => {
    render(<App />)
    fireEvent.click(document.querySelector('.header-add')!)
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: 'Water the plants' } })
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: localDate() } })
    fireEvent.change(screen.getByLabelText(/Subtasks/), { target: { value: 'Water indoor plants' } })
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'daily' } })
    fireEvent.click(document.querySelector('.dialog .btn.primary')!)
    fireEvent.click(screen.getByLabelText('Water indoor plants'))
    fireEvent.click(screen.getByRole('button', { name: 'Complete Water the plants' }))

    expect(screen.getByRole('button', { name: 'Mark Water the plants incomplete' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Upcoming' })[0])
    expect(screen.getByRole('button', { name: 'Water the plants' })).toBeInTheDocument()
    expect(screen.getByText('0/1 subtasks')).toBeInTheDocument()
  })

  it('restores tasks from local storage after the app is remounted', () => {
    const first = render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Quick add task' }), { target: { value: 'Persist this task' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Quick add task' }).closest('form')!)
    first.unmount()
    render(<App />)
    expect(screen.getByRole('button', { name: 'Persist this task' })).toBeInTheDocument()
  })

  it('opens and closes the editor with keyboard shortcuts and keeps empty states useful', () => {
    render(<App />)
    expect(screen.getByText('Your day is clear')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'n' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: '/' })
    expect(document.activeElement).toBe(screen.getByPlaceholderText('Search anything…'))
  })

  it('exports JSON and CSV from Settings', async () => {
    const previousCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL')
    const previousRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL')
    const createUrl = vi.fn(() => 'blob:doneday-test')
    const revokeUrl = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl })
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Export JSON' }))
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1))
    expect(revokeUrl).toHaveBeenCalledWith('blob:doneday-test')
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(anchorClick).toHaveBeenCalledTimes(2)
    if (previousCreate) Object.defineProperty(URL, 'createObjectURL', previousCreate); else Reflect.deleteProperty(URL, 'createObjectURL')
    if (previousRevoke) Object.defineProperty(URL, 'revokeObjectURL', previousRevoke); else Reflect.deleteProperty(URL, 'revokeObjectURL')
  })

  it('imports a JSON backup and reports malformed JSON without crashing', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
    const badFile = new File(['{bad json'], 'broken.json', { type: 'application/json' })
    Object.defineProperty(badFile, 'text', { value: async () => '{bad json' })
    fireEvent.change(input, { target: { files: [badFile] } })
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid|JSON|Unexpected/i)
    const goodFile = new File([JSON.stringify({ tasks: [{ id: 'backup-task', title: 'Imported plan' }], categories: [] })], 'backup.json', { type: 'application/json' })
    Object.defineProperty(goodFile, 'text', { value: async () => JSON.stringify({ tasks: [{ id: 'backup-task', title: 'Imported plan' }], categories: [] }) })
    fireEvent.change(input, { target: { files: [goodFile] } })
    await waitFor(() => expect(screen.getByText('Backup imported')).toBeInTheDocument())
    fireEvent.click(screen.getAllByRole('button', { name: 'My Tasks' })[0])
    expect(screen.getByRole('button', { name: 'Imported plan' })).toBeInTheDocument()
  })

  it('requests and toggles notification permission from Settings', async () => {
    class MockNotification {
      static permission = 'default'
      static requestPermission = vi.fn(async () => { MockNotification.permission = 'granted'; return 'granted' as NotificationPermission })
      constructor(_title: string, _options?: NotificationOptions) {}
    }
    vi.stubGlobal('Notification', MockNotification)
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(screen.getByRole('button', { name: 'Enable' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Disable' })).toHaveAttribute('aria-pressed', 'true'))
    expect(MockNotification.requestPermission).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    expect(screen.getByRole('button', { name: 'Enable' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('keeps all page routes reachable and sorts tasks alphabetically', () => {
    render(<App />)
    for (const title of ['Zebra task', 'Apple task']) {
      fireEvent.change(screen.getByRole('textbox', { name: 'Quick add task' }), { target: { value: title } })
      fireEvent.submit(screen.getByRole('textbox', { name: 'Quick add task' }).closest('form')!)
    }
    fireEvent.click(screen.getAllByRole('button', { name: 'My Tasks' })[0])
    fireEvent.change(screen.getByLabelText('Sort tasks'), { target: { value: 'name' } })
    const titles = Array.from(document.querySelectorAll('.task-title')).map(element => element.textContent)
    expect(titles.slice(0, 2)).toEqual(['Apple task', 'Zebra task'])
    for (const page of ['Dashboard', 'Today', 'Upcoming', 'Overdue', 'Completed']) {
      fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${page}`) })[0])
      expect(document.querySelector('h1')?.textContent).toMatch(new RegExp(page === 'Dashboard' ? 'Good' : page === 'Today' ? 'Today' : page))
    }
  })

  it('shows the correct tasks in Today, Upcoming, Overdue, and Completed views', () => {
    const today = localDate()
    const tasks = [
      createTask({ title: 'Today task', dueDate: today }),
      createTask({ title: 'Future task', dueDate: addDays(today, 3) }),
      createTask({ title: 'Overdue task', dueDate: addDays(today, -2) }),
      createTask({ title: 'Completed task', dueDate: today, completed: true }),
    ]
    localStorage.setItem('doneday-v1', JSON.stringify({ ...DEFAULT_DATA, tasks }))
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: 'Today' })[0])
    expect(screen.getByRole('button', { name: 'Today task' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Overdue task' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Future task' })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Upcoming' })[0])
    expect(screen.getByRole('button', { name: 'Future task' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today task' })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: /Overdue/ })[0])
    expect(screen.getByRole('button', { name: 'Overdue task' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Future task' })).not.toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Completed' })[0])
    expect(screen.getByRole('button', { name: 'Mark Completed task incomplete' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Today task' })).not.toBeInTheDocument()
  })

  it('respects the delete confirmation setting', () => {
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<App />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Quick add task' }), { target: { value: 'Keep this task' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Quick add task' }).closest('form')!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Settings' })[0])
    fireEvent.click(screen.getByLabelText('Confirm before deleting'))
    fireEvent.click(screen.getAllByRole('button', { name: 'My Tasks' })[0])
    fireEvent.click(screen.getByLabelText('Actions for Keep this task'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(confirmation).toHaveBeenCalledWith('Delete “Keep this task”?')
    expect(screen.getByRole('button', { name: 'Keep this task' })).toBeInTheDocument()
    confirmation.mockReturnValue(true)
    fireEvent.click(screen.getByLabelText('Actions for Keep this task'))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.queryByRole('button', { name: 'Keep this task' })).not.toBeInTheDocument()
  })

  it('validates whitespace-only titles and traps keyboard focus in the editor', () => {
    render(<App />)
    fireEvent.click(document.querySelector('.header-add')!)
    const title = screen.getByLabelText('Task name')
    fireEvent.change(title, { target: { value: '   ' } })
    fireEvent.submit(title.closest('form')!)
    expect(screen.getByText('Please enter a task name.')).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: 'Close' })
    const save = document.querySelector<HTMLButtonElement>('.dialog .btn.primary')!
    save.focus()
    fireEvent.keyDown(save, { key: 'Tab' })
    expect(document.activeElement).toBe(close)
    close.focus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(save)
    expect(dialog).toHaveAttribute('aria-modal', 'true')
  })

  it('adds planner tasks and daily routines on the selected date', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Daily Planner' })[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Planner quick add task' }), { target: { value: 'Plan the afternoon' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Planner quick add task' }).closest('form')!)
    expect(screen.getByText('Plan the afternoon')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Routine name' }), { target: { value: 'Read' } })
    fireEvent.submit(screen.getByRole('textbox', { name: 'Routine name' }).closest('form')!)
    expect(screen.getByText('Read')).toBeInTheDocument()
  })

  it('creates and shows an annual birthday', () => {
    render(<App />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Birthdays' })[0])
    fireEvent.change(screen.getByRole('textbox', { name: 'Birthday name' }), { target: { value: 'Sarah' } })
    fireEvent.change(screen.getByLabelText('Birthday date'), { target: { value: '2000-12-24' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add birthday' }))
    expect(screen.getByText('Sarah')).toBeInTheDocument()
  })

  it('keeps guest mode available and explains that cloud setup is optional', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Account and cloud sync' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Keep using DoneDay as a guest')
    expect(screen.getByText(/VITE_SUPABASE_URL/)).toBeInTheDocument()
  })
})
