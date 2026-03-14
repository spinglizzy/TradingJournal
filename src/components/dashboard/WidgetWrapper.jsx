import { useState, useRef, useEffect } from 'react'
import { GripVertical, Settings, X, Maximize2, Minimize2 } from 'lucide-react'
import { WIDGET_REGISTRY } from './widgetRegistry.js'

const SIZE_LABELS = { small: 'Small (¼)', medium: 'Medium (½)', large: 'Large (¾)', full: 'Full width' }
const SIZE_CYCLE  = { small: 'medium', medium: 'large', large: 'full', full: 'small' }

export default function WidgetWrapper({
  config,
  onRemove,
  onUpdate,
  isDragging,
  dragHandleProps,
  children,
}) {
  const [showSettings, setShowSettings] = useState(false)
  const [isHovered,    setIsHovered]    = useState(false)
  const meta  = WIDGET_REGISTRY[config.type]
  const panelRef = useRef(null)

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return
    function handle(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [showSettings])

  function cycleSize() {
    const allowed = meta?.allowedSizes ?? ['small', 'medium', 'large', 'full']
    const curr    = config.size ?? meta?.defaultSize ?? 'medium'
    const nextIdx = (allowed.indexOf(curr) + 1) % allowed.length
    onUpdate({ size: allowed[nextIdx] })
  }

  const minHeight = getMinHeight(config.size)

  return (
    <div
      className="relative flex flex-col rounded-xl transition-all duration-200"
      style={{
        minHeight,
        background:  'var(--color-card)',
        border:      `1px solid ${isHovered && !isDragging ? 'color-mix(in srgb, var(--color-accent) 60%, transparent)' : 'var(--color-border)'}`,
        boxShadow:   isHovered && !isDragging ? '0 0 12px 2px color-mix(in srgb, var(--color-accent) 25%, transparent), 0 0 4px 0px color-mix(in srgb, var(--color-accent) 40%, transparent)' : 'none',
        opacity:     isDragging ? 0.5 : 1,
        transform:   isDragging ? 'scale(0.98)' : 'scale(1)',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header bar */}
      <div className="relative z-10 flex items-center gap-2 px-4 pt-3 pb-0 flex-shrink-0">
        {/* Drag handle */}
        <button
          {...dragHandleProps}
          className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing transition-colors flex-shrink-0 touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Title */}
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1 truncate select-none">
          {meta?.name ?? config.type}
        </span>

        {/* Size toggle */}
        <button
          onClick={cycleSize}
          className="text-gray-600 hover:text-gray-300 transition-colors p-0.5 rounded"
          title={`Size: ${SIZE_LABELS[config.size] ?? config.size} — click to cycle`}
        >
          {config.size === 'full' || config.size === 'large'
            ? <Minimize2 className="w-3.5 h-3.5" />
            : <Maximize2 className="w-3.5 h-3.5" />
          }
        </button>

        {/* Settings */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-0.5 rounded transition-colors ${showSettings ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-300'}`}
            title="Widget settings"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          {showSettings && (
            <SettingsPanel config={config} meta={meta} onUpdate={onUpdate} />
          )}
        </div>

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
      <div className="relative z-10 flex-1 px-4 pb-4 pt-3 min-h-0">
        {children}
      </div>
    </div>
  )
}

function SettingsPanel({ config, meta, onUpdate }) {
  const allowed = meta?.allowedSizes ?? ['small', 'medium', 'large', 'full']
  const settings = config.settings ?? {}

  return (
    <div className="absolute right-0 top-6 z-30 w-56 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-3 space-y-3">
      <div className="text-xs font-semibold text-gray-300 pb-1 border-b border-gray-700">
        {meta?.name ?? config.type} settings
      </div>

      {/* Size */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 font-medium">Width</label>
        <div className="grid grid-cols-2 gap-1">
          {allowed.map(s => (
            <button
              key={s}
              onClick={() => onUpdate({ size: s })}
              className={`text-xs py-1.5 rounded-lg transition-colors font-medium ${
                config.size === s
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
              }`}
            >
              {SIZE_LABELS[s] ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* Period override */}
      <div className="space-y-1.5">
        <label className="text-xs text-gray-400 font-medium">Period override</label>
        <select
          value={settings.period ?? 'global'}
          onChange={e => onUpdate({ settings: { ...settings, period: e.target.value } })}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg text-xs text-gray-200 px-2 py-1.5 outline-none focus:border-indigo-500"
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
}

function getMinHeight(size) {
  switch (size) {
    case 'small':  return 140
    case 'medium': return 280
    case 'large':  return 300
    case 'full':   return 300
    default:       return 200
  }
}
