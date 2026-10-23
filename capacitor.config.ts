import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.doneday.mobile',
  appName: 'DoneDay',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
