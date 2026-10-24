import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// UI tests run offline. Cloud-specific suites provide their own Supabase client mock.
vi.mock('../src/supabase', () => ({
  cloudConfigured: false,
  cloudSetupMessage: 'Cloud sync is ready to connect. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to enable accounts.',
  supabase: null,
  appRedirectUrl: () => 'http://localhost/',
}))

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
