import { useState } from 'react'
import { useTheme, PRESET_THEMES } from '../../contexts/ThemeContext.jsx'

const PRESET_DESCRIPTIONS = {
  'Classic Dark':       'The default — clean dark theme with indigo accents.',
  'Bloomberg Terminal': 'Amber accents on pure black. Bright profit/loss contrast.',
  'Light Mode':         'Light backgrounds with muted text for daytime use.',
}

const CHART_SLOT_LABELS = [
  'Primary', 'Secondary', 'Tertiary', '4th', '5th', '6th', '7th', '8th',
]

function ColorSwatch({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-400 min-w-0 truncate">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-xs font-mono text-gray-500">{value}</span>
        <label className="relative cursor-pointer">
          <div
            className="w-7 h-7 rounded-lg border-2 border-gray-600 shadow-sm cursor-pointer hover:scale-110 transition-transform"
            style={{ backgroundColor: value }}
          />
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
          />
        </label>
      </div>
    </div>
  )
}

export default function ThemeEditor() {
  const {
    themeName, activeTheme, customThemes, presetNames,
    setTheme, saveCustomTheme, deleteCustomTheme,
  } = useTheme()

  const [draft, setDraft] = useState({ ...activeTheme })
  const [saveName, setSaveName] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  // Keep draft in sync when switching themes
  const switchTheme = (name) => {
    setTheme(name)
    const t = PRESET_THEMES[name] ?? customThemes[name]
    if (t) { setDraft({ ...t }); setIsDirty(false) }
  }

  function updateDraft(key, value) {
    setDraft(prev => ({ ...prev, [key]: value }))
    setIsDirty(true)
  }

  function updateChartColor(index, value) {
    setDraft(prev => {
      const charts = [...prev.charts]
      charts[index] = value
      return { ...prev, charts }
    })
    setIsDirty(true)
  }

  function applyDraft() {
    // Apply without saving — updates the active theme's CSS vars in real time
    // ThemeContext picks up the change via saveCustomTheme or setTheme
    // For real-time preview we save to active custom theme
    const name = saveName.trim() || `Custom ${Date.now()}`
    saveCustomTheme(name, draft)
    setSaveName('')
    setIsDirty(false)
  }

  function handleSaveNamed() {
    const name = saveName.trim()
    if (!name) return
    saveCustomTheme(name, draft)
    setSaveName('')
    setIsDirty(false)
  }

  const customNames = Object.keys(customThemes)

  return (
    <div className="space-y-6">
      {/* Preset selector */}
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Presets</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {presetNames.map(name => {
            const t = PRESET_THEMES[name]
            const isActive = themeName === name && !isDirty
            return (
              <button
                key={name}
                onClick={() => switchTheme(name)}
                className={`relative p-4 rounded-xl border text-left transition-all ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-500/5'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                {/* Mini colour preview */}
                <div className="flex gap-1.5 mb-3">
                  <div className="w-5 h-5 rounded-md" style={{ background: t.sidebar }} />
                  <div className="w-5 h-5 rounded-md" style={{ background: t.card }} />
                  <div className="w-5 h-5 rounded-md" style={{ background: t.accent }} />
                  <div className="w-5 h-5 rounded-md" style={{ background: t.profitHex }} />
                  <div className="w-5 h-5 rounded-md" style={{ background: t.lossHex }} />
                </div>
                <p className="text-sm font-medium text-white">{name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{PRESET_DESCRIPTIONS[name]}</p>
                {isActive && (
                  <div className="absolute top-2.5 right-2.5 w-2 h-2 bg-indigo-400 rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Saved custom themes */}
      {customNames.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Saved Custom Themes</p>
          <div className="space-y-2">
            {customNames.map(name => {
              const t = customThemes[name]
              const isActive = themeName === name
              return (
                <div
                  key={name}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                    isActive ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-gray-800 bg-gray-800/30'
                  }`}
                >
                  {/* Mini swatches */}
                  <div className="flex gap-1">
                    {[t.sidebar, t.accent, t.profitHex, t.lossHex].map((c, i) => (
                      <div key={i} className="w-4 h-4 rounded" style={{ background: c }} />
                    ))}
                  </div>
                  <span className="flex-1 text-sm text-white">{name}</span>
                  <button
                    onClick={() => {
                      setTheme(name)
                      setDraft({ ...t })
                      setIsDirty(false)
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-indigo-600/20 text-indigo-400'
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                  >
                    {isActive ? 'Active' : 'Use'}
                  </button>
                  <button
                    onClick={() => deleteCustomTheme(name)}
                    className="p-1 text-gray-600 hover:text-red-400 transition-colors"
                    title="Delete theme"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Custom editor */}
      <div>
        <p className="text-xs uppercase tracking-widest text-gray-500 font-semibold mb-3">Customise</p>
        <div className="bg-gray-800/40 border border-gray-700/60 rounded-xl p-5 space-y-5">

          {/* Core colors */}
          <div>
            <p className="text-xs text-gray-500 mb-3">Core Colours</p>
            <div className="space-y-3">
              <ColorSwatch label="Accent"          value={draft.accent}     onChange={v => updateDraft('accent', v)} />
              <ColorSwatch label="Accent Hover"    value={draft.accentHover} onChange={v => updateDraft('accentHover', v)} />
              <ColorSwatch label="Accent Light"    value={draft.accentLight} onChange={v => updateDraft('accentLight', v)} />
              <ColorSwatch label="Profit Colour"   value={draft.profitHex}  onChange={v => updateDraft('profitHex', v)} />
              <ColorSwatch label="Loss Colour"     value={draft.lossHex}    onChange={v => updateDraft('lossHex', v)} />
            </div>
          </div>

          {/* Sidebar & backgrounds */}
          <div>
            <p className="text-xs text-gray-500 mb-3">Sidebar & Background</p>
            <div className="space-y-3">
              <ColorSwatch label="Sidebar Background"   value={draft.sidebar}       onChange={v => updateDraft('sidebar', v)} />
              <ColorSwatch label="Page Background"      value={draft.base}          onChange={v => updateDraft('base', v)} />
              <ColorSwatch label="Card Background"      value={draft.card}          onChange={v => updateDraft('card', v)} />
              <ColorSwatch label="Secondary Background" value={draft.cardSecondary} onChange={v => updateDraft('cardSecondary', v)} />
              <ColorSwatch label="Border"               value={draft.border}        onChange={v => updateDraft('border', v)} />
            </div>
          </div>

          {/* Text */}
          <div>
            <p className="text-xs text-gray-500 mb-3">Text Colours</p>
            <div className="space-y-3">
              <ColorSwatch label="Primary Text"   value={draft.textPrimary}   onChange={v => updateDraft('textPrimary', v)} />
              <ColorSwatch label="Secondary Text" value={draft.textSecondary} onChange={v => updateDraft('textSecondary', v)} />
              <ColorSwatch label="Muted Text"     value={draft.textMuted}     onChange={v => updateDraft('textMuted', v)} />
            </div>
          </div>

          {/* Mode */}
          <div>
            <p className="text-xs text-gray-500 mb-3">Mode</p>
            <div className="flex gap-3">
              {['dark', 'light'].map(m => (
                <button
                  key={m}
                  onClick={() => updateDraft('mode', m)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                    draft.mode === m
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-gray-800 text-gray-400 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {m === 'dark' ? '🌙 Dark' : '☀️ Light'}
                </button>
              ))}
            </div>
          </div>

          {/* Chart palette */}
          <div>
            <p className="text-xs text-gray-500 mb-3">Chart Colour Palette</p>
            <div className="grid grid-cols-4 gap-3">
              {draft.charts.map((c, i) => (
                <div key={i} className="space-y-1.5">
                  <label className="relative cursor-pointer block">
                    <div
                      className="w-full h-10 rounded-lg border-2 border-gray-600 hover:scale-105 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                    <input
                      type="color"
                      value={c}
                      onChange={e => updateChartColor(i, e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                  </label>
                  <p className="text-xs text-gray-600 text-center">{CHART_SLOT_LABELS[i]}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Save actions */}
          <div className="pt-3 border-t border-gray-700/50 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveNamed() }}
                placeholder="Theme name…"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
              />
              <button
                onClick={handleSaveNamed}
                disabled={!saveName.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Save As
              </button>
            </div>
            {isDirty && (
              <button
                onClick={applyDraft}
                className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
              >
                Apply without saving
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
