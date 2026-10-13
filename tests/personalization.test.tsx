import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { greetingFor, initialsFor, shouldShowWelcome } from '../src/personalization'
import { WelcomeScreen } from '../src/WelcomeScreen'

describe('personalized DoneDay experience', () => {
  it('formats local morning, afternoon, evening, and guest greetings safely', () => {
    expect(greetingFor(new Date(2026, 9, 13, 9), 'Dimas')).toBe('Good morning, Dimas! ☀️')
    expect(greetingFor(new Date(2026, 9, 13, 14), 'Dimas')).toBe('Good afternoon, Dimas!')
    expect(greetingFor(new Date(2026, 9, 13, 20), 'Dimas')).toBe('Good evening, Dimas! 🌙')
    expect(greetingFor(new Date(2026, 9, 13, 9), '')).toBe('Good morning! ☀️')
    expect(greetingFor(new Date(2026, 9, 13, 9), '  ')).not.toContain('undefined')
    expect(initialsFor('Dimas Ade', '')).toBe('DA')
    expect(shouldShowWelcome({ cloudReady: true, isGuest: true, hasUser: false, hasGuestChoice: false, hasExistingLocalData: false })).toBe(true)
    expect(shouldShowWelcome({ cloudReady: true, isGuest: true, hasUser: false, hasGuestChoice: true, hasExistingLocalData: false })).toBe(false)
    expect(shouldShowWelcome({ cloudReady: true, isGuest: false, hasUser: true, hasGuestChoice: false, hasExistingLocalData: false })).toBe(false)
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
