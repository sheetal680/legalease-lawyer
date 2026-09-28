import { useState, useRef, useEffect, useId } from 'react'

// A text input that filters a list as you type, rather than a <select>.
//
// A native <select> on a phone opens a wheel the advocate has to scroll
// through, and it cannot be typed at. Court lists are long and the names are
// near-identical ("I Addl. District & Sessions Court, …" repeated per
// district), so being able to type three letters and narrow the list is the
// difference between usable and not.
//
// The value is always one of `options` — this is a picker, not a free-text
// field. Typing only filters; it never becomes the value.
export default function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Type to search…',
  disabled = false,
  emptyHint = 'No matches.',
  id,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrap = useRef(null)
  const listId = useId()

  const filtered = query.trim()
    ? options.filter(o => o.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  // A click anywhere else closes the list. Listening on the document rather
  // than using onBlur: blur fires before the click lands on an option, which
  // would close the list out from under the very click that chose something.
  useEffect(() => {
    if (!open) return
    const onDown = e => { if (!wrap.current?.contains(e.target)) close() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
  }

  function choose(option) {
    onChange(option)
    close()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { close(); return }
    if (e.key === 'Tab') { close(); return }
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true); setActive(0); e.preventDefault(); return
    }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[active]) choose(filtered[active])
    }
  }

  return (
    <div className="relative" ref={wrap}>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          // qa-input pins this to 16px: anything smaller makes iOS Safari zoom
          // the viewport the moment the field takes focus.
          className="input-field qa-input pr-8"
          disabled={disabled}
          placeholder={value || placeholder}
          value={open ? query : (value || '')}
          onFocus={() => { setOpen(true); setActive(0) }}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0) }}
          onKeyDown={onKeyDown}
        />
        {/* Clearing is its own affordance: with no free-text entry there is
            otherwise no way to unset a court once one has been picked. */}
        {value && !disabled ? (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => { onChange(''); close() }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-lg leading-none px-1">
            &times;
          </button>
        ) : (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">▼</span>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 w-full max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-gray-400">{emptyHint}</li>
          ) : filtered.map((o, i) => (
            <li
              // Index is part of the key deliberately: an options list that
              // ever contains a repeat would otherwise collide here and make
              // the rendered list disagree with the filter.
              key={`${i}-${o}`}
              role="option"
              aria-selected={o === value}
              // onMouseDown, not onClick: the input's blur would otherwise run
              // first and tear the list down before the click resolved.
              onMouseDown={e => { e.preventDefault(); choose(o) }}
              onMouseEnter={() => setActive(i)}
              className={`px-3 py-2.5 text-sm cursor-pointer ${
                i === active ? 'bg-blue-50 text-[#1e3a5f]' : 'text-gray-700'
              } ${o === value ? 'font-semibold' : ''}`}>
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
