import { useState, useRef, useEffect, forwardRef } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical, Settings, X } from 'lucide-react'
import { WIDGET_REGISTRY } from './widgetRegistry.js'

export default function WidgetWrapper({ config, onRemove, onUpdate, children }) {
  const [showSettings, setShowSettings] = useState(false)
  const [isHovered,    setIsHovered]    = useState(false)
  const [panelPos,     setPanelPos]     = useState(null)
  const meta       = WIDGET_REGISTRY[config.type]
  const gearBtnRef = useRef(null)
  const portalRef  = useRef(null)

  // Close settings panel when clicking outside gear button or panel
  useEffect(() => {
    if (!showSettings) return
    function handle(e) {
      if (gearBtnRef.current?.contains(e.target)) return
      if (portalRef.current?.contains(e.target))  return
      setShowSettings(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showSettings])

  function toggleSettings() {
    if (!showSettings && gearBtnRef.current) {
      const rect = gearBtnRef.current.getBoundingClientRect()
      setPanelPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right })
    }
    setShowSettings(v => !v)
  }

  return (
    <div
      className="relative flex flex-col rounded-xl"
      style={{
        height:     '100%',
        background: 'var(--color-card)',
        border:     `1px solid ${isHovered
          ? 'color-mix(in srgb, var(--color-accent) 60%, transparent)'
          : 'var(--color-border)'}`,
        boxShadow: isHovered
          ? '0 0 12px 2px color-mix(in srgb, var(--color-accent) 25%, transparent), 0 0 4px 0px color-mix(in srgb, var(--color-accent) 40%, transparent)'
          : 'none',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-0 flex-shrink-0">
        {/* Drag handle — RGL listens for .widget-drag-handle */}
        <button
          className="widget-drag-handle text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Title */}
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1 truncate select-none">
          {meta?.name ?? config.type}
        </span>

        {/* Settings gear */}
        <button
          ref={gearBtnRef}
          onClick={toggleSettings}
          className={`p-0.5 rounded transition-colors ${
            showSettings ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-300'
          }`}
          title="Widget settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="text-gray-700 hover:text-red-400 transition-colors p-0.5 rounded"
          title="Remove widget"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Widget content */}
      <div className="flex-1 px-4 pb-4 pt-3 min-h-0 overflow-hidden">
        {children}
      </div>

      {/* Settings panel — rendered via portal so it's never clipped */}
      {showSettings && panelPos && createPortal(
        <SettingsPanel
          ref={portalRef}
          config={config}
          meta={meta}
          onUpdate={onUpdate}
          pos={panelPos}
        />,
        document.body
      )}
    </div>
  )
}

const SettingsPanel = forwardRef(function SettingsPanel({ config, meta, onUpdate, pos }, ref) {
  const settings = config.settings ?? {}

  return (
    <div
      ref={ref}
      style={{
        position:     'fixed',
        top:          pos.top,
        right:        pos.right,
        zIndex:       99999,
        width:        '224px',
        background:   '#1c1c1c',
        border:       '1px solid rgba(255,255,255,0.14)',
        borderRadius: '12px',
        boxShadow:    '0 24px 64px rgba(0,0,0,0.9), 0 4px 16px rgba(0,0,0,0.6)',
        padding:      '12px',
      }}
    >
      {/* Title */}
      <div style={{
        fontSize:     '11px',
        fontWeight:   600,
        color:        '#fff',
        paddingBottom:'8px',
        marginBottom: '10px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
      }}>
        {meta?.name ?? config.type} settings
      </div>

      {/* Period override */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '11px', color: '#888', fontWeight: 500 }}>
          Period override
        </label>
        <select
          value={settings.period ?? 'global'}
          onChange={e => onUpdate({ settings: { ...settings, period: e.target.value } })}
          style={{
            width:        '100%',
            background:   '#2a2a2a',
            border:       '1px solid rgba(255,255,255,0.12)',
            borderRadius: '8px',
            fontSize:     '12px',
            color:        '#e0e0e0',
            padding:      '6px 8px',
            outline:      'none',
            cursor:       'pointer',
          }}
        >
          <option value="global">Use global filter</option>
          <option value="all">All time</option>
          <option value="ytd">Year to date</option>
          <option value="mtd">Month to date</option>
          <option value="last30">Last 30 days</option>
          <option value="last7">Last 7 days</option>
        </select>
      </div>
    </div>
  )
})
