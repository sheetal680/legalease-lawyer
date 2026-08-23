import { forwardRef, useImperativeHandle, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { Node, Extension, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'

// Preserves margin-left on paragraphs/headings, the same way the TextAlign
// extension preserves text-align — plain inline `style="margin-left:..."`
// on a <p>/<h1-6> is otherwise silently dropped by TipTap's HTML parser
// (arbitrary style properties aren't kept unless an extension explicitly
// tracks them). Needed to reproduce forms whose printed layout shifts a
// block of text into a narrower column rather than the full page width.
const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          marginLeft: {
            default: null,
            parseHTML: element => element.style.marginLeft || null,
            renderHTML: attributes => {
              if (!attributes.marginLeft) return {}
              return { style: `margin-left: ${attributes.marginLeft}` }
            },
          },
        },
      },
    ]
  },
})

// A page break must be a real registered node — an unrecognized bare <div>
// is silently deleted (not just stripped of styling) when TipTap parses HTML
// that doesn't match anything in its schema.
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: false,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-page-break': 'true',
      class: 'page-break-marker',
      style: 'page-break-before: always; break-before: page; height: 0; margin: 0; border: none;',
    })]
  },
})

// A4 at 96dpi (210mm). The document page is ALWAYS laid out at this width —
// on every screen size — so line breaks, tab gaps and right-aligned text land
// exactly where they do on desktop and in the exported PDF. Narrow screens
// scale the whole page down instead of reflowing it (see FitToWidth below).
const PAGE_WIDTH = 794

function ToolbarButton({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 px-2.5 py-1.5 rounded text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor }) {
  if (!editor) return null

  const todayFormatted = () =>
    new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="doc-toolbar flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-3 py-2 sticky top-0 z-10">
      <select
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1' :
          editor.isActive('heading', { level: 2 }) ? 'h2' :
          editor.isActive('heading', { level: 3 }) ? 'h3' : 'p'
        }
        onChange={e => {
          const v = e.target.value
          if (v === 'p') editor.chain().focus().setParagraph().run()
          else editor.chain().focus().toggleHeading({ level: Number(v.slice(1)) }).run()
        }}
        className="shrink-0 text-sm border border-gray-200 rounded px-2 py-1.5 bg-white mr-1"
      >
        <option value="p">Normal</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>

      <div className="shrink-0 w-px h-5 bg-gray-300 mx-1" />

      <ToolbarButton title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline">U</span>
      </ToolbarButton>

      <div className="shrink-0 w-px h-5 bg-gray-300 mx-1" />

      <ToolbarButton title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        ☰•
      </ToolbarButton>
      <ToolbarButton title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        ☰1
      </ToolbarButton>

      <div className="shrink-0 w-px h-5 bg-gray-300 mx-1" />

      <ToolbarButton title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        ⟸
      </ToolbarButton>
      <ToolbarButton title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        ⟺
      </ToolbarButton>
      <ToolbarButton title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        ⟹
      </ToolbarButton>
      <ToolbarButton title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        ☰
      </ToolbarButton>

      <div className="shrink-0 w-px h-5 bg-gray-300 mx-1" />

      <ToolbarButton title="Insert today's date" onClick={() => editor.chain().focus().insertContent(todayFormatted()).run()}>
        📅 Date
      </ToolbarButton>

      <div className="shrink-0 w-px h-5 bg-gray-300 mx-1" />

      <ToolbarButton title="Insert page break" onClick={() => editor.chain().focus().insertContent({ type: 'pageBreak' }).run()}>
        ⤓ Page Break
      </ToolbarButton>
    </div>
  )
}

// Scales the fixed-width page down to fit whatever width is available, the way
// a PDF viewer does: the page keeps its A4 layout and is drawn smaller, rather
// than being re-wrapped to the screen. `transform: scale()` is used rather than
// `zoom` deliberately — zoom re-runs layout at the scaled size, and the
// browser's font-size rounding at fractional zoom can shift line breaks by a
// character, which is exactly what must not happen to a court form. A transform
// rasterises a layout that has already been computed at PAGE_WIDTH, so the
// result is pixel-proportional to desktop.
//
// Selection is unaffected: ProseMirror locates positions through
// caretRangeFromPoint / elementFromPoint, which resolve in viewport coordinates
// and account for CSS transforms on ancestors, so taps land on the right
// character at any scale.
function useFitToWidth(pageRef) {
  const hostRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [pageHeight, setPageHeight] = useState(0)

  useLayoutEffect(() => {
    const host = hostRef.current
    const page = pageRef.current
    if (!host || !page) return

    const measure = () => {
      const available = host.clientWidth
      if (available > 0) setScale(Math.min(1, available / PAGE_WIDTH))
      // Read the unscaled height — transform doesn't affect layout, so this
      // can't feed back into the observer and loop.
      setPageHeight(page.offsetHeight)
    }

    measure()
    // ResizeObserver catches container-driven changes (sidebars, the content
    // growing as the advocate types). The window listeners are a second,
    // independent trigger: RO callbacks are delivered on the rendering
    // lifecycle, so a rotate or a soft-keyboard viewport change can otherwise
    // leave the page briefly unscaled.
    const observer = new ResizeObserver(measure)
    observer.observe(host)
    observer.observe(page)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    const raf = requestAnimationFrame(measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      cancelAnimationFrame(raf)
    }
  }, [pageRef])

  return { hostRef, scale, pageHeight }
}

const RichTextEditor = forwardRef(function RichTextEditor({ content, style }, ref) {
  const pageRef = useRef(null)
  const { hostRef, scale, pageHeight } = useFitToWidth(pageRef)

  const editor = useEditor({
    editable: true,
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      PageBreak,
      Indent,
    ],
    content,
    editorProps: {
      attributes: {
        style: 'outline: none;',
      },
    },
  })

  // Sync external content changes (e.g. client/associate re-apply) into the editor,
  // but only when they didn't originate from the editor itself.
  useEffect(() => {
    if (!editor) return
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content || '', { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, editor])

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() ?? content ?? '',
    setHTML: (html) => editor?.commands.setContent(html || '', { emitUpdate: false }),
  }), [editor, content])

  return (
    <div className="doc-surface shadow-md rounded-lg overflow-hidden">
      {/* Toolbar is deliberately outside the scaled area — it stays at full,
          tappable size no matter how far the page itself is scaled down. */}
      <Toolbar editor={editor} />
      <div ref={hostRef} className="doc-viewport">
        {/* Placeholder box that occupies the *scaled* footprint, so the page
            below it flows correctly (a transform leaves layout size untouched). */}
        <div style={{ width: PAGE_WIDTH * scale, height: pageHeight * scale }}>
          <div
            ref={pageRef}
            className="doc-page"
            style={{
              ...style,
              width: PAGE_WIDTH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
})

export default RichTextEditor
