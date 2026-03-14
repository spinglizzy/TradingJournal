import {
  DndContext, closestCenter,
  PointerSensor, KeyboardSensor,
  useSensor, useSensors,
  DragOverlay,
} from '@dnd-kit/core'
import {
  SortableContext, sortableKeyboardCoordinates,
  rectSortingStrategy, useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import WidgetWrapper from './WidgetWrapper.jsx'
import { WIDGET_REGISTRY } from './widgetRegistry.js'

// Grid column spans per size
const COL_SPAN = {
  small:  'col-span-1',
  medium: 'col-span-2',
  large:  'col-span-3',
  full:   'col-span-4',
}

export default function WidgetGrid({ layout, setLayout }) {
  const [activeId, setActiveId] = useState(null)

  const sensors = useSensors(
    useSensor(PointerSensor,  { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragStart(event) {
    setActiveId(event.active.id)
  }

  function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return
    setLayout(prev => {
      const oldIndex = prev.findIndex(w => w.id === active.id)
      const newIndex = prev.findIndex(w => w.id === over.id)
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  function removeWidget(id) {
    setLayout(prev => prev.filter(w => w.id !== id))
  }

  function updateWidget(id, patch) {
    setLayout(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w))
  }

  const activeWidget = activeId ? layout.find(w => w.id === activeId) : null

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={layout.map(w => w.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-4 gap-4 auto-rows-auto">
          {layout.map(widget => (
            <SortableWidget
              key={widget.id}
              widget={widget}
              onRemove={() => removeWidget(widget.id)}
              onUpdate={(patch) => updateWidget(widget.id, patch)}
            />
          ))}
        </div>
      </SortableContext>

      {/* Drag overlay — shows ghost of the dragged widget */}
      <DragOverlay>
        {activeWidget && (
          <div
            className={`${COL_SPAN[activeWidget.size] ?? 'col-span-2'} opacity-90`}
            style={{ cursor: 'grabbing' }}
          >
            <div className="bg-gray-900 border border-indigo-500/50 rounded-xl shadow-2xl p-4 ring-1 ring-indigo-500/20">
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                {WIDGET_REGISTRY[activeWidget.type]?.name ?? activeWidget.type}
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

function SortableWidget({ widget, onRemove, onUpdate }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id })

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
  }

  const meta      = WIDGET_REGISTRY[widget.type]
  const Component = meta?.component

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${COL_SPAN[widget.size] ?? 'col-span-2'}`}
    >
      <WidgetWrapper
        config={widget}
        onRemove={onRemove}
        onUpdate={onUpdate}
        isDragging={isDragging}
        dragHandleProps={{ ...listeners, ...attributes }}
      >
        {Component
          ? <Component config={widget} />
          : <div className="flex items-center justify-center h-24 text-gray-600 text-xs">Unknown widget: {widget.type}</div>
        }
      </WidgetWrapper>
    </div>
  )
}
