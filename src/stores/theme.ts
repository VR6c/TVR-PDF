import { create } from 'zustand'

type Theme = 'light' | 'dark'

const read = (): Theme => {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable: fall through to the default */
  }
  return 'light'
}

const apply = (t: Theme) => document.documentElement.classList.toggle('dark', t === 'dark')

export const useTheme = create<{ theme: Theme; toggle: () => void }>((set, get) => {
  const initial = read()
  apply(initial)
  return {
    theme: initial,
    toggle: () => {
      const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
      apply(next)
      try {
        localStorage.setItem('theme', next)
      } catch {
        /* preference just won't persist */
      }
      set({ theme: next })
    },
  }
})
