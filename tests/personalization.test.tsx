import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { greetingFor, hasMeaningfulLocalData, initialsFor, shouldShowWelcome } from '../src/personalization'
import { createTask, DEFAULT_DATA } from '../src/domain'
import { WelcomeScreen } from '../src/WelcomeScreen'

describe('personalized DoneDay experience', () => {
  it('formats local morning, afternoon, evening, and guest greetings safely', () => {
    expect(greetingFor(new Date(2026, 9, 13, 9), 'Dimas')).toBe('Good morning, Dimas! ☀️')
    expect(greetingFor(new Date(2026, 9, 13, 14), 'Dimas')).toBe('Good afternoon, Dimas!')
    expect(greetingFor(new Date(2026, 9, 13, 20), 'Dimas')).toBe('Good evening, Dimas! 🌙')
    expect(greetingFor(new Date(2026, 9, 13, 9), '')).toBe('Good morning! ☀️')
    expect(greetingFor(new Date(2026, 9, 13, 9), '  ')).not.toContain('undefined')
    expect(initialsFor('Dimas Ade', '')).toBe('DA')
    expect(shouldShowWelcome({ authReady: true, hasUser: false, hasGuestChoice: false, hasExistingLocalData: false })).toBe(true)
    expect(shouldShowWelcome({ authReady: true, hasUser: false, hasGuestChoice: true, hasExistingLocalData: false })).toBe(false)
    expect(shouldShowWelcome({ authReady: true, hasUser: true, hasGuestChoice: false, hasExistingLocalData: false })).toBe(false)
    expect(shouldShowWelcome({ authReady: false, hasUser: false, hasGuestChoice: false, hasExistingLocalData: false })).toBe(false)
  })

  it('distinguishes automatic empty storage from guest work and honors the saved onboarding choice', () => {
    // New installations and the default object written after their first render both show onboarding.
    expect(hasMeaningfulLocalData(DEFAULT_DATA)).toBe(false)
    expect(shouldShowWelcome({ authReady: true, hasUser: false, hasGuestChoice: false, hasExistingLocalData: hasMeaningfulLocalData(DEFAULT_DATA) })).toBe(true)

    // Existing tasks remain available without forcing a guest through onboarding again.
    const guestData = { ...DEFAULT_DATA, tasks: [createTask({ title: 'Keep my local task' })] }
    expect(hasMeaningfulLocalData(guestData)).toBe(true)
    expect(shouldShowWelcome({ authReady: true, hasUser: false, hasGuestChoice: false, hasExistingLocalData: hasMeaningfulLocalData(guestData) })).toBe(false)

    // Returning guests and authenticated users both bypass the welcome screen once known.
    expect(shouldShowWelcome({ authReady: true, hasUser: false, hasGuestChoice: true, hasExistingLocalData: false })).toBe(false)
    expect(shouldShowWelcome({ authReady: true, hasUser: true, hasGuestChoice: false, hasExistingLocalData: false })).toBe(false)
  })

  it('shows all first-visit actions and remembers the chosen action through callbacks', () => {
    const create = vi.fn(); const signIn = vi.fn(); const guest = vi.fn()
    render(<WelcomeScreen onCreateAccount={create} onSignIn={signIn} onContinueGuest={guest}/>)
    expect(screen.getByRole('heading', { name: 'Welcome to DoneDay' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Create Free Account/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign In' }))
    fireEvent.click(screen.getByRole('button', { name: /Continue as Guest/ }))
    expect(create).toHaveBeenCalledOnce(); expect(signIn).toHaveBeenCalledOnce(); expect(guest).toHaveBeenCalledOnce()
  })
})
