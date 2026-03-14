import { useRef, useState, useEffect } from 'react'
import ReactGridLayout from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import WidgetWrapper from './WidgetWrapper.jsx'
import { WIDGET_REGISTRY } from './widgetRegistry.js'

const COLS       = 4
const ROW_HEIGHT = 70

export function sizeToGrid(size) {
  switch (size) {
    case 'small':  return { w: 1, h: 2 }
    case 'large':  return { w: 3, h: 5 }
    case 'full':   return { w: 4, h: 5 }
    default:       return { w: 2, h: 4 } // medium
  }
}

// Assign x/y/w/h to any widget that doesn't have them yet (old saved layouts)
function ensurePositions(widgets) {
  let col = 0, row = 0, rowH = 0
  return widgets.map(w => {
    if (w.x != null && w.y != null && w.w != null && w.h != null) return w
    const { w: cw, h: ch } = sizeToGrid(w.size ?? 'medium')
    if (col + cw > COLS) { col = 0; row += rowH; rowH = 0 }
    const result = { ...w, x: col, y: row, w: cw, h: ch }
    col += cw
    rowH = Math.max(rowH, ch)
    return result
  })
}

// Measure container width so we don't need WidthProvider (not exported in v2 ESM)
function useContainerWidth() {
  const ref   = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    setWidth(ref.current.offsetWidth)
    const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

export default function WidgetGrid({ layout, setLayout }) {
  const [containerRef, width] = useContainerWidth()
  const positioned = ensurePositions(layout)

  const rglLayout = positioned.map(w => ({
    i:    w.id,
    x:    w.x,
    y:    w.y,
    w:    w.w,
    h:    w.h,
    minW: 1,
    minH: 2,
  }))

  function handleLayoutChange(newRglLayout) {
    const posMap = {}
    newRglLayout.forEach(item => {
      posMap[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h }
    })
    setLayout(prev => prev.map(w => (w.id in posMap ? { ...w, ...posMap[w.id] } : w)))
  }

  function removeWidget(id) {
    setLayout(prev => prev.filter(w => w.id !== id))
  }

  function updateWidget(id, patch) {
    setLayout(prev => prev.map(w => (w.id === id ? { ...w, ...patch } : w)))
  }

  return (
    <div ref={containerRef}>
      {width > 0 && (
        <ReactGridLayout
          className="rgl-layout"
          layout={rglLayout}
          cols={COLS}
          width={width}
          rowHeight={ROW_HEIGHT}
          margin={[10, 10]}
          containerPadding={[0, 0]}
          draggableHandle=".widget-drag-handle"
          resizeHandles={['se', 'sw', 's', 'e']}
          compactType="vertical"
          onDragStop={handleLayoutChange}
          onResizeStop={handleLayoutChange}
          useCSSTransforms
        >
          {positioned.map(widget => {
            const meta      = WIDGET_REGISTRY[widget.type]
            const Component = meta?.component
            return (
              <div key={widget.id} className="rgl-item" style={{ height: '100%', width: '100%' }}>
                <WidgetWrapper
                  config={widget}
                  onRemove={() => removeWidget(widget.id)}
                  onUpdate={patch => updateWidget(widget.id, patch)}
                >
                  {Component
                    ? <Component config={widget} />
                    : <div className="flex items-center justify-center h-full text-gray-600 text-xs">
                        Unknown widget: {widget.type}
                      </div>
                  }
                </WidgetWrapper>
              </div>
            )
          })}
        </ReactGridLayout>
      )}
    </div>
  )
}
