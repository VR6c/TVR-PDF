import { registerSW } from 'virtual:pwa-register'
import { create } from 'zustand'
import { useNotice } from './stores/notice'

interface InstallEvent extends Event {
  prompt(): Promise<void>
}

/** Install prompt (Chromium only). `null` when unavailable or already installed. */
export const useInstall = create<{ event: InstallEvent | null }>(() => ({ event: null }))

export function setupPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    useInstall.setState({ event: e as InstallEvent })
  })
  window.addEventListener('appinstalled', () => useInstall.setState({ event: null }))

  const update = registerSW({
    onNeedRefresh: () =>
      useNotice.getState().show('info', 'A new version is ready.', { label: 'Reload to update', run: () => void update(true) }),
    onOfflineReady: () => useNotice.getState().show('info', 'Ready to work offline.'),
  })
}
