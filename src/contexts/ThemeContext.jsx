import { createContext, useContext, useState, useEffect, useCallback } from 'react'

// ── Preset theme definitions ───────────────────────────────────────────────────
export const PRESET_THEMES = {
  'Liquid Dark': {
    accent:        '#9aea62',
    accentHover:   '#7fd64a',
    accentLight:   '#b5f08a',
    profitHex:     '#9aea62',
    lossHex:       '#f87171',
    sidebar:       '#141414',
    base:          '#0a0a0a',
    card:          '#141414',
    cardSecondary: '#1c1c1c',
    border:        'rgba(255,255,255,0.08)',
    textPrimary:   '#ffffff',
    textSecondary: '#888888',
    textMuted:     '#555555',
    charts:        ['#9aea62','#38bdf8','#fbbf24','#f472b6','#34d399','#a78bfa','#fb923c','#22d3ee'],
    mode:          'dark',
  },
  'Classic Dark': {
    accent:        '#6366f1',
    accentHover:   '#4f46e5',
    accentLight:   '#818cf8',
    profitHex:     '#10b981',
    lossHex:       '#ef4444',
    sidebar:       '#111827',
    base:          '#030712',
    card:          '#111827',
    cardSecondary: '#1f2937',
    border:        '#1f2937',
    textPrimary:   '#ffffff',
    textSecondary: '#9ca3af',
    textMuted:     '#6b7280',
    charts:        ['#6366f1','#10b981','#f59e0b','#ec4899','#06b6d4','#8b5cf6','#f97316','#14b8a6'],
    mode:          'dark',
  },
  'Bloomberg Terminal': {
    accent:        '#f59e0b',
    accentHover:   '#d97706',
    accentLight:   '#fcd34d',
    profitHex:     '#00cc44',
    lossHex:       '#ff3333',
    sidebar:       '#000000',
    base:          '#050505',
    card:          '#111111',
    cardSecondary: '#1a1a1a',
    border:        '#2a2a2a',
    textPrimary:   '#ffffff',
    textSecondary: '#aaaaaa',
    textMuted:     '#666666',
    charts:        ['#f59e0b','#00cc44','#ff6600','#ff3333','#00aaff','#ff00ff','#00ffcc','#ffcc00'],
    mode:          'dark',
  },
  'Light Mode': {
    accent:        '#6366f1',
    accentHover:   '#4f46e5',
    accentLight:   '#6366f1',
    profitHex:     '#059669',
    lossHex:       '#dc2626',
    sidebar:       '#f1f5f9',
    base:          '#e2e8f0',
    card:          '#ffffff',
    cardSecondary: '#f8fafc',
    border:        '#e2e8f0',
    textPrimary:   '#0f172a',
    textSecondary: '#475569',
    textMuted:     '#94a3b8',
    charts:        ['#6366f1','#059669','#f59e0b','#ec4899','#0891b2','#7c3aed','#ea580c','#0d9488'],
    mode:          'light',
  },
}

const THEME_KEY         = 'tradelog_active_theme'
const CUSTOM_THEMES_KEY = 'tradelog_custom_themes'

function loadCustomThemes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) ?? '{}') } catch { return {} }
}

function getTheme(name, custom) {
  return PRESET_THEMES[name] ?? custom[name] ?? PRESET_THEMES['Classic Dark']
}

// ── Apply a theme object to the DOM ───────────────────────────────────────────
function applyThemeToDom(theme, name) {
  const root = document.documentElement
  const s    = root.style

  s.setProperty('--color-accent',        theme.accent)
  s.setProperty('--color-accent-hover',  theme.accentHover)
  s.setProperty('--color-accent-light',  theme.accentLight)
  s.setProperty('--color-profit',        theme.profitHex)
  s.setProperty('--color-loss',          theme.lossHex)
  s.setProperty('--color-sidebar',       theme.sidebar)
  s.setProperty('--color-base',          theme.base)
  s.setProperty('--color-card',          theme.card)
  s.setProperty('--color-card-2',        theme.cardSecondary)
  s.setProperty('--color-border',        theme.border)
  s.setProperty('--color-text-primary',  theme.textPrimary)
  s.setProperty('--color-text-secondary',theme.textSecondary)
  s.setProperty('--color-text-muted',    theme.textMuted)
  theme.charts.forEach((c, i) => s.setProperty(`--chart-${i + 1}`, c))

  root.setAttribute('data-theme', theme.mode === 'light' ? 'light' : 'dark')
  root.setAttribute('data-theme-name', (name ?? '').toLowerCase().replace(/\s+/g, '-'))
  document.documentElement.style.colorScheme = theme.mode === 'light' ? 'light' : 'dark'
}

// ── Context ───────────────────────────────────────────────────────────────────
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [customThemes, setCustomThemesRaw] = useState(loadCustomThemes)
  const [themeName, setThemeNameRaw] = useState(
    () => localStorage.getItem(THEME_KEY) ?? 'Liquid Dark'
  )

  const activeTheme = getTheme(themeName, customThemes)

  // Apply theme on mount + whenever it changes
  useEffect(() => {
    applyThemeToDom(activeTheme, themeName)
  }, [activeTheme, themeName])

  const setTheme = useCallback((name) => {
    setThemeNameRaw(name)
    localStorage.setItem(THEME_KEY, name)
  }, [])

  const saveCustomTheme = useCallback((name, themeData) => {
    setCustomThemesRaw(prev => {
      const updated = { ...prev, [name]: themeData }
      localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updated))
      return updated
    })
    setTheme(name)
  }, [setTheme])

  const deleteCustomTheme = useCallback((name) => {
    setCustomThemesRaw(prev => {
      const updated = { ...prev }
      delete updated[name]
      localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(updated))
      return updated
    })
    if (themeName === name) setTheme('Classic Dark')
  }, [themeName, setTheme])

  return (
    <ThemeContext.Provider value={{
      themeName,
      activeTheme,
      customThemes,
      presetNames: Object.keys(PRESET_THEMES),
      allThemeNames: [...Object.keys(PRESET_THEMES), ...Object.keys(customThemes)],
      setTheme,
      saveCustomTheme,
      deleteCustomTheme,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider')
  return ctx
}
