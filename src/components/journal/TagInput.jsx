import { useState, useRef, useEffect } from 'react'

export default function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [input, setInput] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef(null)

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s)
  ).slice(0, 8)

  function addTag(tag) {
    const trimmed = tag.trim()
    if (!trimmed || tags.includes(trimmed)) return
    onChange([...tags, trimmed])
    setInput('')
    setShowSuggestions(false)
  }

  function removeTag(tag) {
    onChange(tags.filter(t => t !== tag))
  }

  function handleKeyDown(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length) {
      removeTag(tags[tags.length - 1])
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 items-center min-h-9 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-lg focus-within:border-indigo-500 transition-colors cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map(tag => (
          <span
            key={tag}
            className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeTag(tag) }}
              className="text-indigo-400 hover:text-white transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={e => { setInput(e.target.value); setShowSuggestions(true) }}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={tags.length === 0 ? 'Add tags…' : ''}
          className="flex-1 min-w-20 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
        />
      </div>

      {showSuggestions && (input || filtered.length > 0) && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden">
          {filtered.map(s => (
            <button
              key={s}
              type="button"
              onMouseDown={() => addTag(s)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {s}
            </button>
          ))}
          {input.trim() && !tags.includes(input.trim()) && (
            <button
              type="button"
              onMouseDown={() => addTag(input)}
              className="w-full text-left px-3 py-1.5 text-sm text-indigo-400 hover:bg-gray-700 transition-colors border-t border-gray-700"
            >
              + Create "{input.trim()}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
