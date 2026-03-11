import { useState, useEffect, useCallback } from 'react'
import { Plus, LayoutDashboard } from 'lucide-react'
import { DashboardProvider } from '../contexts/DashboardContext.jsx'
import WidgetGrid      from '../components/dashboard/WidgetGrid.jsx'
import WidgetPicker    from '../components/dashboard/WidgetPicker.jsx'
import PresetManager   from '../components/dashboard/PresetManager.jsx'
import DateRangeFilter from '../components/dashboard/DateRangeFilter.jsx'
import { WIDGET_REGISTRY, DEFAULT_LAYOUT } from '../components/dashboard/widgetRegistry.js'

const LAYOUT_KEY = 'dashboard_layout'

function loadLayout() {
  try {
    const saved = localStorage.getItem(LAYOUT_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return DEFAULT_LAYOUT
}

function saveLayout(layout) {
  localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout))
}

// Unique ID generator
let _uid = Date.now()
function uid() { return `w-${++_uid}` }

export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardInner />
    </DashboardProvider>
  )
}

function DashboardInner() {
  const [layout, setLayoutRaw]  = useState(loadLayout)
  const [showPicker, setPicker] = useState(false)

  // Persist layout on every change
  const setLayout = useCallback((updater) => {
    setLayoutRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveLayout(next)
      return next
    })
  }, [])

  function addWidget(type) {
    const meta = WIDGET_REGISTRY[type]
    setLayout(prev => [
      ...prev,
      {
        id:       uid(),
        type,
        size:     meta?.defaultSize ?? 'medium',
        settings: {},
      },
    ])
  }

  const existingTypes = layout.map(w => w.type)

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-bold text-white">Dashboard</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Drag widgets to reorder · click ⚙ to configure · click size icon to resize
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Date range filter */}
          <DateRangeFilter />

          {/* Preset manager */}
          <PresetManager layout={layout} setLayout={setLayout} />

          {/* Add widget */}
          <button
            onClick={() => setPicker(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Widget
          </button>
        </div>
      </div>

      {/* Empty state */}
      {layout.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 border-2 border-dashed border-gray-800 rounded-2xl">
          <div className="text-5xl">📊</div>
          <div className="text-center">
            <p className="text-gray-300 font-semibold">Your dashboard is empty</p>
            <p className="text-gray-500 text-sm mt-1">Add widgets to start tracking your performance</p>
          </div>
          <button
            onClick={() => setPicker(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors mt-2"
          >
            <Plus className="w-4 h-4" />
            Add your first widget
          </button>
        </div>
      )}

      {/* Widget grid */}
      {layout.length > 0 && (
        <WidgetGrid layout={layout} setLayout={setLayout} />
      )}

      {/* Widget picker modal */}
      {showPicker && (
        <WidgetPicker
          onAdd={addWidget}
          onClose={() => setPicker(false)}
          existingTypes={existingTypes}
        />
      )}
    </div>
  )
}
