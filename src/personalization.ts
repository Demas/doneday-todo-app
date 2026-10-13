import { DEFAULT_CATEGORIES, DEFAULT_SETTINGS, type AppData } from './domain'

export const cleanDisplayName = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 80) : ''
export const greetingFor = (date: Date, displayName = '') => {
  const hour = date.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const icon = hour < 12 ? ' ☀️' : hour >= 18 ? ' 🌙' : ''
  const name = cleanDisplayName(displayName)
  return `${greeting}${name ? `, ${name}` : ''}!${icon}`
}
export const initialsFor = (displayName = '', email = '') => {
  const words = cleanDisplayName(displayName).split(' ').filter(Boolean)
  if (words.length) return words.slice(0, 2).map(word => word[0]).join('').toUpperCase()
  return cleanDisplayName(email).slice(0, 1).toUpperCase() || 'D'
}
/**
 * The app writes the default data shape on first start. That write must not be
 * mistaken for an onboarding decision or saved guest work.
 */
export const hasMeaningfulLocalData = (data: AppData) =>
  data.tasks.length > 0 || data.birthdays.length > 0 || data.routines.length > 0 ||
  JSON.stringify(data.categories) !== JSON.stringify(DEFAULT_CATEGORIES) ||
  JSON.stringify(data.settings) !== JSON.stringify(DEFAULT_SETTINGS)

export const shouldShowWelcome = ({ authReady, hasUser, hasGuestChoice, hasExistingLocalData }: { authReady: boolean; hasUser: boolean; hasGuestChoice: boolean; hasExistingLocalData: boolean }) =>
  authReady && !hasUser && !hasGuestChoice && !hasExistingLocalData
