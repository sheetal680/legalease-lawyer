// Converts the TipTap-generated HTML (paragraphs/headings with text-align,
// margin-left, <strong>/<em>/<u> marks, and a data-page-break marker) into a
// small structured "blocks" model, then renders that model to a real PDF
// (jsPDF, vector text) or a real .docx (docx library, native OOXML) — both
// downloaded directly, with page breaks placed explicitly rather than left
// to CSS pagination or a browser's print engine. This guarantees the page
// count matches what the blocks encode: there is no heuristic pagination
// step that could silently add or drop a page.
//
// Because pagination is explicit, content that runs past the bottom of a
// page would be clipped rather than flowing onward, so the PDF builder also
// reports an `overflow` flag that callers surface to the user instead of
// silently shipping a truncated document.
//
// A template may declare its own page margin (printed court forms rarely use
// a 1in margin) via a marker element:  <div data-page-margin="45"></div>

import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx'

const HEADING_LEVEL = { H1: 1, H2: 2, H3: 3, H4: 4, H5: 5, H6: 6 }

// jsPDF measures U+00A0 at ~6.12pt in Times while a real space is 3pt, so
// nbsp-based padding desynchronises measured width from rendered width and
// breaks wrapping. Templates use real glyphs (dots/underscores) for visible
// fill-lines; any remaining nbsp is normalised to a plain space here.
const NBSP = String.fromCharCode(160)
function normaliseSpaces(text) {
  return text.split(NBSP).join(' ')
}

function parseInlineRuns(node, fmt = { bold: false, italic: false, underline: false }) {
  const runs = []
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = normaliseSpaces(child.textContent)
      if (text) splitByScript(text).forEach(seg => runs.push({ text: seg.text, script: seg.script, ...fmt }))
      return
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return
    const tag = child.tagName
    const next = {
      bold: fmt.bold || tag === 'STRONG' || tag === 'B',
      italic: fmt.italic || tag === 'EM' || tag === 'I',
      underline: fmt.underline || tag === 'U',
    }
    runs.push(...parseInlineRuns(child, next))
  })
  return runs
}

export function parseDocumentHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const blocks = []
  let pendingPageBreak = false

  doc.body.childNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = node.tagName

    if (tag === 'DIV' && node.hasAttribute('data-page-break')) {
      pendingPageBreak = true
      return
    }
    if (tag === 'DIV' && node.hasAttribute('data-page-margin')) return
    if (tag === 'DIV' && node.hasAttribute('data-page-font')) return

    if (tag === 'P' || HEADING_LEVEL[tag]) {
      const style = node.getAttribute('style') || ''
      const alignMatch = style.match(/text-align:\s*(\w+)/)
      const marginMatch = style.match(/margin-left:\s*([\d.]+)%/)
      blocks.push({
        type: HEADING_LEVEL[tag] ? 'heading' : 'paragraph',
        level: HEADING_LEVEL[tag] || null,
        align: alignMatch ? alignMatch[1] : 'left',
        marginLeftPct: marginMatch ? parseFloat(marginMatch[1]) : 0,
        pageBreakBefore: pendingPageBreak,
        runs: parseInlineRuns(node),
      })
      pendingPageBreak = false
    }
  })

  return blocks
}

// Accepts a scalar (all sides) or a CSS-order list "top right bottom left".
export function normaliseMargin(m) {
  if (m == null) return { top: 72, right: 72, bottom: 72, left: 72 }
  if (typeof m === 'number') return { top: m, right: m, bottom: m, left: m }
  if (Array.isArray(m)) {
    const [t, r = t, b = t, l = r] = m
    return { top: t, right: r, bottom: b, left: l }
  }
  return { top: 72, right: 72, bottom: 72, left: 72, ...m }
}

export function parsePageMargin(html, fallback = 72) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const el = doc.querySelector('div[data-page-margin]')
  if (!el) return normaliseMargin(fallback)
  const parts = (el.getAttribute('data-page-margin') || '')
    .trim().split(/[\s,]+/).map(parseFloat).filter(Number.isFinite)
  if (!parts.length) return normaliseMargin(fallback)
  return normaliseMargin(parts.length === 1 ? parts[0] : parts)
}

// A template may declare its own typeface (scanned court forms are often a
// sans face, not Times) via:  <div data-page-font="helvetica"></div>
// Fonts that must be embedded because jsPDF's built-in Type1 faces are
// WinAnsi-only and cannot carry non-Latin scripts. Add an entry here plus a
// base64 module under ./fonts and a template can use it by declaring
// <div data-page-font="telugu"></div> — no renderer changes needed.
export const EMBEDDED_FONTS = {
  telugu: () => import('./fonts/notoSansTelugu.js'),
}

export function parsePageFont(html, fallback = 'times') {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const el = doc.querySelector('div[data-page-font]')
  const v = el && (el.getAttribute('data-page-font') || '').trim().toLowerCase()
  if (!v) return fallback
  if (v === 'arial') return 'helvetica'
  return v
}

// Pulls in an embedded font's binary if the template asked for one. Returns
// null for the built-in faces, which need no assets.
export async function loadFontAssets(font) {
  const loader = EMBEDDED_FONTS[font]
  if (!loader) return null
  const m = await loader()
  return { key: font, family: m.family, docxFamily: m.docxFamily, regular: m.regular, bold: m.bold }
}

// Registers an embedded font on a jsPDF instance and returns the family name
// to pass to setFont; built-ins pass straight through.
function useFont(pdf, font, assets) {
  if (!assets || assets.key !== font) return font
  pdf.addFileToVFS(assets.family + '-Regular.ttf', assets.regular)
  pdf.addFont(assets.family + '-Regular.ttf', assets.family, 'normal')
  if (assets.bold) {
    pdf.addFileToVFS(assets.family + '-Bold.ttf', assets.bold)
    pdf.addFont(assets.family + '-Bold.ttf', assets.family, 'bold')
  }
  return assets.family
}

const DOCX_FONT = { helvetica: 'Arial', times: 'Times New Roman', courier: 'Courier New' }

// Word resolves fonts per-run, so a mixed-script paragraph just tags each run
// with the face that covers it — same rule the PDF path applies.
function docxFontFor(run, font, fontAssets, latinFont) {
  if (run.script === 'telugu' && fontAssets && fontAssets.key === font && fontAssets.docxFamily) {
    return fontAssets.docxFamily
  }
  const latinKey = EMBEDDED_FONTS[font] ? (latinFont || 'helvetica') : font
  return DOCX_FONT[latinKey] || 'Times New Roman'
}

// Drawn seal: the printed forms show the word "Seal" inside a circle, which
// is a vector shape rather than text, so templates carry this sentinel and
// the PDF renderer draws the circle in its place.
const SEAL_TOKEN = '((SEAL))'

function blockText(block) {
  return block.runs.map(r => r.text).join('')
}

// ── Shared metrics ─────────────────────────────────────────────────
const PT_PAGE_W = 595.28   // A4 width in pt
const PT_PAGE_H = 841.89   // A4 height in pt
const BODY_SIZE = 12
const LINE_HEIGHT_RATIO = 1.25
const PARA_GAP = BODY_SIZE * 0.15
const HEADING_SIZE = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 12 }

function fontSizeFor(block) {
  return block.type === 'heading' ? (HEADING_SIZE[block.level] || 14) : BODY_SIZE
}

// A heading is bold by default, but if the author marked part of it with
// <strong> then that markup is authoritative and the unmarked parts stay
// regular weight (some printed forms set only the form name in bold and
// leave its statutory citation light).
function headingBoldsAll(block) {
  return block.type === 'heading' && !block.runs.some(r => r.bold)
}

function fontStyleFor(fmt, isHeading) {
  const bold = fmt.bold || isHeading
  if (bold && fmt.italic) return 'bolditalic'
  if (bold) return 'bold'
  if (fmt.italic) return 'italic'
  return 'normal'
}

// ── Elastic fill-lines ─────────────────────────────────────────────
// Printed forms rule a blank to the right margin: the fill-line shrinks as
// the typed value grows so the line always ends flush. A run made only of
// dots or underscores is therefore treated as elastic — it is re-sized to
// consume whatever width is left on its line, rather than being a fixed
// glyph count that overflows and wraps once a placeholder is filled in.
const ELASTIC_RE = /^(\.{4,}|_{4,})$/

// ── Per-run script fallback ────────────────────────────────────────
// A template declares one embedded face, but a mixed-script form (e.g. an
// English heading over a Telugu body) needs each character drawn with the
// face that actually covers it. Text is therefore split into single-script
// segments at parse time and each segment resolves its own family.
const TELUGU_RE = /[ఀ-౿]/
const NEUTRAL_RE = /[\s0-9 -⁯!-@\[-`{-~]/

function splitByScript(text) {
  const out = []
  for (const ch of text) {
    const script = TELUGU_RE.test(ch) ? 'telugu' : 'latin'
    const neutral = NEUTRAL_RE.test(ch)
    const last = out[out.length - 1]
    if (last && (neutral || last.script === script)) { last.text += ch; continue }
    out.push({ text: ch, script })
  }
  return out.length ? out : [{ text, script: 'latin' }]
}

// Which jsPDF family each script uses. The declared page font supplies the
// script face; Latin falls back to a Latin-capable built-in.
function resolveFamilies(font, fontAssets, latinFont) {
  return {
    scriptFamily: fontAssets ? fontAssets.family : null,
    latinFamily: EMBEDDED_FONTS[font] ? (latinFont || 'helvetica') : font,
  }
}

function familyFor(unit, fams) {
  return unit.script === 'telugu' && fams.scriptFamily ? fams.scriptFamily : fams.latinFamily
}

function tokeniseRuns(runs) {
  const units = []
  runs.forEach(r => {
    const tokens = r.text.match(/\s+|\S+/g) || []
    tokens.forEach(t => {
      if (/^\s+$/.test(t)) {
        units.push({ text: t, bold: r.bold, italic: r.italic, underline: r.underline, script: r.script, space: true, elastic: false })
        return
      }
      // A fill-line usually abuts its label with no space ("before......",
      // "[COURT_NAME]______"), so split rule-runs out of the surrounding word.
      t.split(/(\.{4,}|_{4,})/).filter(Boolean).forEach(part => {
        units.push({
          text: part,
          bold: r.bold, italic: r.italic, underline: r.underline, script: r.script,
          space: false,
          elastic: ELASTIC_RE.test(part),
        })
      })
    })
  })
  return units
}

// Lays each block out once, replacing elastic units with a concrete number
// of glyphs, so the PDF and DOCX renderers consume identical text and agree
// on where lines break.
export function expandBlocks(blocks, { margin = 72, font = 'times', fontAssets = null, latinFont = 'helvetica' } = {}) {
  const M = normaliseMargin(margin)
  const gauge = new jsPDF({ unit: 'pt', format: 'a4' })
  useFont(gauge, font, fontAssets)
  const fams = resolveFamilies(font, fontAssets, latinFont)
  const CONTENT_W = PT_PAGE_W - M.left - M.right

  return blocks.map(block => {
    const size = fontSizeFor(block)
    const isHeading = headingBoldsAll(block)
    gauge.setFontSize(size)
    const width = u => {
      gauge.setFont(familyFor(u, fams), fontStyleFor(u, isHeading))
      return gauge.getTextWidth(u.text)
    }

    const units = tokeniseRuns(block.runs)
    if (!units.some(u => u.elastic)) return block

    const indent = (block.marginLeftPct / 100) * CONTENT_W
    const boxWidth = CONTENT_W - indent
    gauge.setFont(fams.latinFamily, 'normal')
    const spaceWidth = gauge.getTextWidth(' ')
    const raw = units.map(u => u.text).join('')
    const leadingSpaces = (raw.match(/^ +/) || [''])[0].length
    const firstLineIndent = leadingSpaces * spaceWidth

    // Break into lines; elastic units take no space while breaking.
    const lines = []
    let cur = []
    let curW = 0
    units.forEach(u => {
      const w = u.elastic ? 0 : width(u)
      const avail = boxWidth - (lines.length === 0 ? firstLineIndent : 0)
      if (cur.length && !u.space && !u.elastic && curW + w > avail) {
        lines.push(cur); cur = [{ ...u, w }]; curW = w; return
      }
      cur.push({ ...u, w }); curW += w
    })
    if (cur.length) lines.push(cur)

    // Give each line's elastic units the width left over on that line.
    const outRuns = []
    lines.forEach((line, li) => {
      const avail = boxWidth - (li === 0 ? firstLineIndent : 0)
      const fixed = line.reduce((s, u) => s + u.w, 0)
      const elastics = line.filter(u => u.elastic)
      if (elastics.length) {
        const share = Math.max(0, (avail - fixed) / elastics.length)
        elastics.forEach(u => {
          gauge.setFont(familyFor(u, fams), fontStyleFor(u, isHeading))
          const glyph = u.text[0]
          const gw = gauge.getTextWidth(glyph)
          u.text = glyph.repeat(Math.max(0, Math.floor(share / gw)))
        })
      }
      line.forEach(u => outRuns.push({
        text: u.text, bold: u.bold, italic: u.italic, underline: u.underline, script: u.script,
      }))
    })

    // Merge adjacent runs sharing formatting so the DOCX stays tidy.
    const merged = []
    outRuns.forEach(r => {
      const last = merged[merged.length - 1]
      if (last && last.bold === r.bold && last.italic === r.italic && last.underline === r.underline && last.script === r.script) {
        last.text += r.text
      } else {
        merged.push({ ...r })
      }
    })

    return { ...block, runs: merged }
  })
}

// ── PDF rendering (jsPDF, vector text, explicit page breaks) ───────
export function buildPdfDoc(rawBlocks, { margin = 72, font = 'times', fontAssets = null, latinFont = 'helvetica' } = {}) {
  const M = normaliseMargin(margin)
  const blocks = expandBlocks(rawBlocks, { margin, font, fontAssets, latinFont })
  const CONTENT_W = PT_PAGE_W - M.left - M.right
  const PAGE_BOTTOM = PT_PAGE_H - M.bottom

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  useFont(pdf, font, fontAssets)
  const fams = resolveFamilies(font, fontAssets, latinFont)
  let y = M.top
  let first = true
  let overflow = false
  let maxY = 0

  const advance = (dy) => {
    y += dy
    if (y > maxY) maxY = y
    if (y > PAGE_BOTTOM) overflow = true
  }

  blocks.forEach(block => {
    if (block.pageBreakBefore && !first) {
      pdf.addPage()
      y = M.top
    }
    first = false

    const size = fontSizeFor(block)
    const lineHeight = size * LINE_HEIGHT_RATIO
    const isHeading = headingBoldsAll(block)
    const indent = (block.marginLeftPct / 100) * CONTENT_W
    const boxLeft = M.left + indent
    const boxWidth = CONTENT_W - indent
    const rawText = blockText(block)

    pdf.setFontSize(size)

    if (!rawText.trim()) {
      advance(lineHeight + PARA_GAP)   // blank spacer line
      return
    }

    pdf.setFont(fams.latinFamily, 'normal')
    const spaceWidth = pdf.getTextWidth(' ')
    const leadingSpaces = (rawText.match(/^ +/) || [''])[0].length
    const firstLineIndent = leadingSpaces * spaceWidth

    const baseFmt = block.runs[0] || {}
    const uniform = block.runs.every(r =>
      r.bold === (baseFmt.bold ?? false) &&
      r.italic === (baseFmt.italic ?? false) &&
      r.underline === (baseFmt.underline ?? false) &&
      r.script === baseFmt.script
    )

    if (uniform || isHeading) {
      const fmt = block.runs[0] || { bold: isHeading, italic: false, underline: false }
      pdf.setFont(familyFor(fmt, fams), fontStyleFor(fmt, isHeading))
      const justify = block.align === 'justify'
      const align = justify ? 'left' : block.align
      const text = rawText.slice(leadingSpaces)

      // splitTextToSize collapses runs of spaces, which would destroy the
      // wide blank gaps these forms use to position text across a line
      // (e.g. "( Seal )        MAGISTRATE"). When the text already fits on
      // one line, emit it verbatim so that spacing survives.
      let lines
      if (pdf.getTextWidth(text) <= boxWidth - firstLineIndent) {
        lines = [text]
      } else {
        lines = []
        let remaining = text
        let isFirstLine = true
        while (remaining.length) {
          const avail = boxWidth - (isFirstLine ? firstLineIndent : 0)
          const chunk = pdf.splitTextToSize(remaining, avail)
          lines.push(chunk[0])
          if (chunk.length <= 1) break
          remaining = chunk.slice(1).join(' ')
          isFirstLine = false
        }
      }

      lines.forEach((line, idx) => {
        const lineIndent = idx === 0 ? firstLineIndent : 0
        const lineLeft = boxLeft + lineIndent
        const lineBox = boxWidth - lineIndent
        const isLast = idx === lines.length - 1

        // Seal: draw a real circle with "Seal" centred inside it, in place
        // of the sentinel, then continue the rest of the line after it.
        if (line.includes(SEAL_TOKEN)) {
          const [before, after = ''] = line.split(SEAL_TOKEN)
          let sx = lineLeft
          if (before) { pdf.text(before, sx, y + size * 0.9); sx += pdf.getTextWidth(before) }
          const r = size * 0.95
          const cx = sx + r
          const cy = y + size * 0.45
          pdf.setLineWidth(0.8)
          pdf.circle(cx, cy, r)
          pdf.setFontSize(size * 0.6)
          pdf.text('Seal', cx, cy + size * 0.2, { align: 'center' })
          pdf.setFontSize(size)
          sx += r * 2
          if (after) pdf.text(after, sx, y + size * 0.9)
          advance(lineHeight)
          return
        }

        if (justify && !isLast) {
          const words = line.split(' ').filter(Boolean)
          if (words.length > 1) {
            const wordsWidth = words.reduce((s, w) => s + pdf.getTextWidth(w), 0)
            const gap = (lineBox - wordsWidth) / (words.length - 1)
            let x = lineLeft
            words.forEach(w => {
              pdf.text(w, x, y + size * 0.9)
              x += pdf.getTextWidth(w) + gap
            })
            advance(lineHeight)
            return
          }
        }

        let x = lineLeft
        if (align === 'center') x = lineLeft + lineBox / 2
        else if (align === 'right') x = lineLeft + lineBox
        pdf.text(line, x, y + size * 0.9, { align: align === 'left' ? undefined : align })
        if (fmt.underline) {
          const w = pdf.getTextWidth(line)
          const ux = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
          pdf.setLineWidth(0.6)
          pdf.line(ux, y + size * 1.0, ux + w, y + size * 1.0)
        }
        advance(lineHeight)
      })
      advance(PARA_GAP)
      return
    }

    // Mixed formatting within one block (e.g. "In the court of the" +
    // underlined rule + bold "J.F.C.M."). Word-wrap across runs, keeping a
    // run that is purely blank/rule filler atomic so a fill-line is never
    // split in the middle.
    // Tokenise into words AND whitespace runs, so a wide blank gap between
    // two differently-formatted spans (e.g. bold "SUMMONS" then a 12-space
    // gap then the citation) survives as its own measurable unit instead of
    // being collapsed to a single separator space.
    const units = []
    block.runs.forEach(r => {
      const fmt = { bold: r.bold, italic: r.italic, underline: r.underline }
      const tokens = r.text.match(/\s+|\S+/g) || []
      tokens.forEach(t => units.push({ text: t, space: /^\s+$/.test(t), ...fmt }))
    })

    const lines = []
    let current = []
    let currentWidth = 0
    units.forEach(u => {
      pdf.setFont(familyFor(u, fams), fontStyleFor(u, false))
      const w = pdf.getTextWidth(u.text)
      const avail = boxWidth - (lines.length === 0 ? firstLineIndent : 0)
      if (current.length && !u.space && currentWidth + w > avail) {
        lines.push(current)
        current = [{ ...u, width: w }]
        currentWidth = w
        return
      }
      current.push({ ...u, width: w })
      currentWidth += w
    })
    if (current.length) lines.push(current)

    lines.forEach((lineUnits, idx) => {
      let x = boxLeft + (idx === 0 ? firstLineIndent : 0)
      lineUnits.forEach(u => {
        if (!u.space) {
          pdf.setFont(familyFor(u, fams), fontStyleFor(u, false))
          pdf.text(u.text, x, y + size * 0.9)
        }
        if (u.underline) {
          pdf.setLineWidth(0.6)
          pdf.line(x, y + size * 1.0, x + u.width, y + size * 1.0)
        }
        x += u.width
      })
      advance(lineHeight)
    })
    advance(PARA_GAP)
  })

  return { pdf, overflow, maxY, pageBottom: PAGE_BOTTOM }
}

export function renderPdf(blocks, filename, opts) {
  const { pdf, overflow } = buildPdfDoc(blocks, opts)
  pdf.save(filename)
  return { overflow }
}

// ── DOCX rendering (docx library, native OOXML) ─────────────────────
const A4_WIDTH_TWIPS = 11907
const A4_HEIGHT_TWIPS = 16839
const PT_TO_TWIP = 20

export function buildDocxDoc(rawBlocks, { margin = 72, font = 'times', fontAssets = null, latinFont = 'helvetica' } = {}) {
  const M = normaliseMargin(margin)
  const blocks = expandBlocks(rawBlocks, { margin, font, fontAssets, latinFont })
  const tw = v => Math.round(v * PT_TO_TWIP)
  const contentWidthTwips = A4_WIDTH_TWIPS - tw(M.left) - tw(M.right)

  const alignmentMap = {
    left: AlignmentType.LEFT,
    center: AlignmentType.CENTER,
    right: AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
  }

  const paragraphs = blocks.map(block => {
    const size = fontSizeFor(block) * 2 // half-points
    const indent = Math.round((block.marginLeftPct / 100) * contentWidthTwips)
    const raw = blockText(block)
    const leadingSpaces = (raw.match(/^ +/) || [''])[0].length
    const firstLine = leadingSpaces ? leadingSpaces * 60 : undefined

    const runs = block.runs.length ? block.runs : [{ text: '' }]
    // Word has no simple inline circle; the enclosed-alphanumeric glyph is
    // the closest available stand-in for the drawn seal.
    const children = runs.map((r, i) => new TextRun({
      text: (i === 0 ? (r.text || '').slice(leadingSpaces) : r.text)
        .split(SEAL_TOKEN).join('Ⓢeal'),
      bold: r.bold || headingBoldsAll(block),
      italics: r.italic,
      underline: r.underline ? {} : undefined,
      size,
      font: docxFontFor(r, font, fontAssets, latinFont),
    }))

    return new Paragraph({
      children,
      alignment: alignmentMap[block.align] || AlignmentType.LEFT,
      indent: (indent || firstLine) ? { left: indent || undefined, firstLine } : undefined,
      pageBreakBefore: block.pageBreakBefore || undefined,
      spacing: { line: Math.round(LINE_HEIGHT_RATIO * 240), after: Math.round(PARA_GAP * 20) },
    })
  })

  return new Document({
    sections: [{
      properties: {
        page: {
          size: { width: A4_WIDTH_TWIPS, height: A4_HEIGHT_TWIPS },
          margin: { top: tw(M.top), bottom: tw(M.bottom), left: tw(M.left), right: tw(M.right) },
        },
      },
      children: paragraphs,
    }],
  })
}

export async function renderDocx(blocks, filename, opts) {
  const doc = buildDocxDoc(blocks, opts)
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function buildFilename(templateName, clientName, ext) {
  const slug = (s) => (s || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const base = clientName ? `${slug(templateName)}-${slug(clientName)}` : slug(templateName)
  return `${base}.${ext}`
}
