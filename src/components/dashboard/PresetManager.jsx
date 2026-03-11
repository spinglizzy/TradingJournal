import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Save, Trash2, RotateCcw, Check } from 'lucide-react'
import { DEFAULT_LAYOUT } from './widgetRegistry.js'

const STORAGE_KEY = 'dashboard_presets'
const ACTIVE_KEY  = 'dashboard_active_preset'

export function loadPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') } catch { return {} }
}

export function savePresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

export default function PresetManager({ layout, setLayout }) {
  const [presets, setPresets]       = useState(loadPresets)
  const [activePreset, setActive]   = useState(() => localStorage.getItem(ACTIVE_KEY) ?? '')
  const [showMenu, setShowMenu]     = useState(false)
  const [saveMode, setSaveMode]     = useState(false)
  const [newName, setNewName]       = useState('')
  const [saved, setSaved]           = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!showMenu) return
    function handle(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showMenu])

  function loadPreset(name) {
    const layout = presets[name]
    if (!layout) return
    setLayout(layout)
    setActive(name)
    localStorage.setItem(ACTIVE_KEY, name)
    setShowMenu(false)
  }

  function saveCurrentAsPreset(name) {
    const updated = { ...presets, [name]: layout }
    setPresets(updated)
    savePresets(updated)
    setActive(name)
    localStorage.setItem(ACTIVE_KEY, name)
    setSaveMode(false)
    setNewName('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function deletePreset(name) {
    const { [name]: _, ...rest } = presets
    setPresets(rest)
    savePresets(rest)
    if (activePreset === name) {
      setActive('')
      localStorage.removeItem(ACTIVE_KEY)
    }
  }

  function resetToDefault() {
    setLayout(DEFAULT_LAYOUT)
    setActive('')
    localStorage.removeItem(ACTIVE_KEY)
    setShowMenu(false)
  }

  const presetNames = Object.keys(presets)

  return (
    <div className="flex items-center gap-2">
      {/* Save / update button */}
      {saveMode ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newName.trim()) saveCurrentAsPreset(newName.trim())
              if (e.key === 'Escape') setSaveMode(false)
            }}
            placeholder="Preset name…"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 outline-none focus:border-indigo-500 w-36"
          />
          <button
            onClick={() => newName.trim() && saveCurrentAsPreset(newName.trim())}
            disabled={!newName.trim()}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors font-medium"
          >
            Save
          </button>
          <button
            onClick={() => setSaveMode(false)}
            className="px-2 py-1.5 text-gray-400 hover:text-gray-200 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            if (activePreset) {
              saveCurrentAsPreset(activePreset)
            } else {
              setSaveMode(true)
              setNewName('')
            }
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 hover:text-white text-xs rounded-lg transition-colors font-medium"
          title={activePreset ? `Update "${activePreset}"` : 'Save layout as preset'}
        >
          {saved ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved!' : activePreset ? `Update "${activePreset}"` : 'Save layout'}
        </button>
      )}

      {/* Presets dropdown */}
      {presetNames.length > 0 && !saveMode && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowMenu(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 border text-xs rounded-lg transition-colors font-medium ${
              activePreset
                ? 'bg-indigo-600/10 border-indigo-500/30 text-indigo-400 hover:border-indigo-500/50'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {activePreset || 'Presets'}
            <ChevronDown className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="p-1">
                {presetNames.map(name => (
                  <div
                    key={name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors group ${
                      activePreset === name ? 'bg-indigo-600/15 text-indigo-300' : 'hover:bg-gray-700 text-gray-300'
                    }`}
                    onClick={() => loadPreset(name)}
                  >
                    <span className="flex-1 text-xs font-medium truncate">{name}</span>
                    {activePreset === name && <Check className="w-3 h-3 text-indigo-400 flex-shrink-0" />}
                    <button
                      onClick={e => { e.stopPropagation(); deletePreset(name) }}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-700 p-1">
                <button
                  onClick={resetToDefault}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-xs transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to default layout
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset button when no presets */}
      {presetNames.length === 0 && !saveMode && (
        <button
          onClick={resetToDefault}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-gray-200 text-xs rounded-lg transition-colors"
          title="Reset to default layout"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
      )}
    </div>
  )
}
