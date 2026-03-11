import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import { useCallback, useRef, useEffect } from 'react'

// ── Toolbar button ────────────────────────────────────────────────────────────
function ToolBtn({ active, onClick, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      className={`p-1.5 rounded text-sm transition-colors ${
        active
          ? 'bg-indigo-600 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-gray-700 mx-0.5" />
}

// ── Upload helper ─────────────────────────────────────────────────────────────
async function uploadImage(file) {
  const form = new FormData()
  form.append('screenshot', file)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error('Upload failed')
  const { path } = await res.json()
  return path
}

// ── Main editor ───────────────────────────────────────────────────────────────
export default function TipTapEditor({ content, onChange, placeholder = 'Start writing…', minHeight = 320 }) {
  const fileInputRef = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: { HTMLAttributes: { class: 'tiptap-code-block' } },
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'tiptap-link' } }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items || [])
        const imageItem = items.find(i => i.type.startsWith('image/'))
        if (!imageItem) return false
        event.preventDefault()
        const file = imageItem.getAsFile()
        uploadImage(file)
          .then(path => view.dispatch(
            view.state.tr.replaceSelectionWith(
              view.state.schema.nodes.image.create({ src: path })
            )
          ))
          .catch(console.error)
        return true
      },
    },
  })

  // Update editor content when prop changes externally (e.g., template applied)
  useEffect(() => {
    if (!editor) return
    const current = editor.getHTML()
    if (content !== current) {
      editor.commands.setContent(content || '', false)
    }
  }, [content]) // eslint-disable-line react-hooks/exhaustive-deps

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href
    const url = window.prompt('URL', prev || 'https://')
    if (url === null) return
    if (url === '') { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  const handleImageFile = useCallback(async (file) => {
    if (!editor || !file) return
    try {
      const path = await uploadImage(file)
      editor.chain().focus().setImage({ src: path }).run()
    } catch {
      alert('Image upload failed')
    }
  }, [editor])

  if (!editor) return null

  return (
    <>
      <style>{`
        .tiptap-root .ProseMirror {
          min-height: ${minHeight}px;
          outline: none;
          color: #e5e7eb;
          line-height: 1.75;
          padding: 1rem;
        }
        .tiptap-root .ProseMirror > * + * { margin-top: 0.5rem; }
        .tiptap-root .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #4b5563;
          pointer-events: none;
          height: 0;
        }
        .tiptap-root .ProseMirror h1 { font-size: 1.5rem; font-weight: 700; color: #fff; margin-top: 1.25rem; }
        .tiptap-root .ProseMirror h2 { font-size: 1.2rem; font-weight: 600; color: #f3f4f6; margin-top: 1rem; }
        .tiptap-root .ProseMirror h3 { font-size: 1rem; font-weight: 600; color: #d1d5db; margin-top: 0.75rem; }
        .tiptap-root .ProseMirror strong { color: #f9fafb; }
        .tiptap-root .ProseMirror em { color: #d1d5db; }
        .tiptap-root .ProseMirror u { text-decoration: underline; }
        .tiptap-root .ProseMirror s { text-decoration: line-through; color: #9ca3af; }
        .tiptap-root .ProseMirror ul { list-style: disc; padding-left: 1.5rem; }
        .tiptap-root .ProseMirror ol { list-style: decimal; padding-left: 1.5rem; }
        .tiptap-root .ProseMirror li { margin-top: 0.2rem; }
        .tiptap-root .ProseMirror blockquote {
          border-left: 3px solid #4f46e5;
          padding-left: 1rem;
          color: #9ca3af;
          font-style: italic;
          margin: 0.5rem 0;
        }
        .tiptap-root .ProseMirror code {
          background: #1f2937;
          padding: 0.1em 0.35em;
          border-radius: 0.25rem;
          font-family: ui-monospace, monospace;
          font-size: 0.875em;
          color: #a78bfa;
        }
        .tiptap-root .ProseMirror .tiptap-code-block {
          background: #111827;
          border: 1px solid #374151;
          border-radius: 0.5rem;
          padding: 1rem;
          overflow-x: auto;
          font-family: ui-monospace, monospace;
          font-size: 0.875em;
          color: #d1d5db;
          margin: 0.5rem 0;
        }
        .tiptap-root .ProseMirror .tiptap-code-block code {
          background: none;
          padding: 0;
          color: inherit;
        }
        .tiptap-root .ProseMirror img {
          max-width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #374151;
          display: block;
          margin: 0.5rem 0;
        }
        .tiptap-root .ProseMirror a.tiptap-link {
          color: #818cf8;
          text-decoration: underline;
          cursor: pointer;
        }
        .tiptap-root .ProseMirror hr {
          border: none;
          border-top: 1px solid #374151;
          margin: 1rem 0;
        }
      `}</style>

      <div className="tiptap-root border border-gray-700 rounded-xl overflow-hidden bg-gray-900/50">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-700 bg-gray-900">
          {/* Text style */}
          <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <span className="font-bold">B</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <span className="italic">I</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
            <span className="underline">U</span>
          </ToolBtn>
          <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <span className="line-through">S</span>
          </ToolBtn>

          <Divider />

          {/* Headings */}
          <ToolBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
            H1
          </ToolBtn>
          <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            H2
          </ToolBtn>
          <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            H3
          </ToolBtn>

          <Divider />

          {/* Lists */}
          <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h10M7 16h10M3 8h.01M3 12h.01M3 16h.01" />
            </svg>
          </ToolBtn>

          <Divider />

          {/* Block elements */}
          <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Inline code">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </ToolBtn>
          <ToolBtn active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </ToolBtn>

          <Divider />

          {/* Link */}
          <ToolBtn active={editor.isActive('link')} onClick={setLink} title="Insert link">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </ToolBtn>

          {/* Image upload */}
          <ToolBtn active={false} onClick={() => fileInputRef.current?.click()} title="Insert image">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </ToolBtn>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleImageFile(e.target.files[0]) }}
          />

          <Divider />

          {/* History */}
          <ToolBtn active={false} onClick={() => editor.chain().focus().undo().run()} title="Undo">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
            </svg>
          </ToolBtn>
          <ToolBtn active={false} onClick={() => editor.chain().focus().redo().run()} title="Redo">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
            </svg>
          </ToolBtn>
        </div>

        {/* Editor area */}
        <EditorContent editor={editor} />
      </div>
    </>
  )
}
