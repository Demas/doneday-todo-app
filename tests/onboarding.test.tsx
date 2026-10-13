import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/supabase', () => ({
  cloudConfigured: true,
  cloudSetupMessage: '',
  supabase: null,
  appRedirectUrl: () => 'http://localhost/',
}))

import App from '../src/App'
import { createTask, DEFAULT_DATA, STORAGE_KEY } from '../src/domain'

describe('DoneDay onboarding', () => {
  beforeEach(() => localStorage.clear())

  it('shows the welcome screen for a new installation and for automatically initialized empty storage', async () => {
    const firstInstall = render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome to DoneDay' })).toBeInTheDocument()
    expect(screen.getByText('Make Today Count.')).toBeInTheDocument()
    expect(screen.getByText(/Plan your tasks, organize your daily activities/)).toBeInTheDocument()
    firstInstall.unmount()

    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DATA))
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Welcome to DoneDay' })).toBeInTheDocument()
  })

  it('opens account registration and sign-in directly from the welcome screen', async () => {
    const view = render(<App />)
    await screen.findByRole('heading', { name: 'Welcome to DoneDay' })
    fireEvent.click(screen.getByRole('button', { name: 'Create Free Account' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Your DoneDay account')
    expect(screen.getByLabelText('Display name')).toBeInTheDocument()
    view.unmount()

    render(<App />)
    await screen.findByRole('heading', { name: 'Welcome to DoneDay' })
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Your DoneDay account')
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  })

  it('remembers an explicit guest choice and keeps account actions discoverable', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Welcome to DoneDay' })
    fireEvent.click(screen.getByRole('button', { name: 'Continue as Guest' }))
    expect(screen.getByRole('textbox', { name: 'Quick add task' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Sign in or create a DoneDay account' }).length).toBeGreaterThan(0)
  })

  it('keeps existing local guest tasks and starts standalone PWAs at the same welcome decision', async () => {
    const standalone = vi.fn(() => ({ matches: true, media: '(display-mode: standalone)', addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    vi.stubGlobal('matchMedia', standalone)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULT_DATA, tasks: [createTask({ title: 'Existing guest task' })] }))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'My Tasks' }))
    expect(await screen.findByRole('button', { name: 'Existing guest task' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Welcome to DoneDay' })).not.toBeInTheDocument()
  })
})
