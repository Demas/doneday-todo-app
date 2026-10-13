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
export const shouldShowWelcome = ({ cloudReady, isGuest, hasUser, hasGuestChoice, hasExistingLocalData }: { cloudReady: boolean; isGuest: boolean; hasUser: boolean; hasGuestChoice: boolean; hasExistingLocalData: boolean }) => cloudReady && isGuest && !hasUser && !hasGuestChoice && !hasExistingLocalData
