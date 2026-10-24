/**
 * Knowledge-base chunking. One chunk is the unit a student can be taught from:
 * a coherent passage, a slide, a timed transcript window, or a formula with its
 * surrounding sentence retained.
 */

const DEFAULT_TARGET = 520
const DEFAULT_MAX = 900

const FORMULA_INLINE = /\$([^$]+)\$|\\\(([\s\S]*?)\\\)/g
const FORMULA_BLOCK = /\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\begin\{(equation\*?|align\*?|displaymath|gather\*?)\}([\s\S]*?)\\end\{\3\}/g

/** Strip math markup from display text while remembering the formulas. */
export function plainText(text) {
  return String(text || '')
    .replace(FORMULA_BLOCK, (whole, a, b, env, body) => ` [formula] `)
    .replace(FORMULA_INLINE, ' [formula] ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Collect LaTeX from one text block. */
export function formulasIn(text) {
  const found = []
  for (const match of String(text || '').matchAll(FORMULA_BLOCK)) {
    const latex = (match[1] || match[2] || match[4] || '').trim()
    if (latex) found.push({ latex, display: true })
  }
  for (const match of String(text || '').matchAll(FORMULA_INLINE)) {
    const latex = (match[1] || match[2] || '').trim()
    if (latex) found.push({ latex, display: false })
  }
  return found
}

function chunkId(sourceId, ordinal) {
  return `${sourceId}#${String(ordinal).padStart(4, '0')}`
}

function trimTo(text, max) {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

/**
 * Chunk structured blocks from a document extraction.
 * @param {{sourceId:string, sourceTitle:string, blocks:ReadonlyArray<object>, meta?:object, concepts?:ReadonlyArray<string>}} input
 * @returns {Array<object>} chunks
 */
export function chunkBlocks(input) {
  const chunks = []
  const concepts = Array.isArray(input.concepts) ? input.concepts : []
  let ordinal = 0
  let headingPath = []
  let buffer = []
  let bufferLength = 0

  const flush = () => {
    if (buffer.length === 0) return
    const text = buffer.join('\n').trim()
    buffer = []
    bufferLength = 0
    if (!text) return
    ordinal += 1
    chunks.push({
      id: chunkId(input.sourceId, ordinal),
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      kind: 'para',
      ordinal,
      text: trimTo(text, DEFAULT_MAX),
      concepts,
      meta: { ...(input.meta || {}), heading: headingPath[headingPath.length - 1] || undefined, path: headingPath.slice() },
    })
  }

  for (const block of input.blocks || []) {
    if (!block || typeof block !== 'object') continue
    if (block.kind === 'heading') {
      flush()
      const level = Number(block.level || 1)
      headingPath = headingPath.slice(0, Math.max(0, level - 1))
      headingPath[level - 1] = String(block.text || '').trim()
      continue
    }
    if (block.kind === 'formula') {
      flush()
      ordinal += 1
      chunks.push({
        id: chunkId(input.sourceId, ordinal),
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        kind: 'formula',
        ordinal,
        text: `公式：${block.latex || ''}\n读法：${block.read || ''}`,
        concepts,
        latex: block.latex || '',
        read: block.read || '',
        meta: { ...(input.meta || {}), page: block.page, heading: headingPath[headingPath.length - 1] || undefined },
      })
      continue
    }
    if (block.kind === 'table') {
      flush()
      const rows = Array.isArray(block.rows) ? block.rows : []
      if (rows.length === 0) continue
      const rendered = rows.slice(0, 24).map((row) => row.join(' | ')).join('\n')
      ordinal += 1
      chunks.push({
        id: chunkId(input.sourceId, ordinal),
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        kind: 'table',
        ordinal,
        text: trimTo(rendered, DEFAULT_MAX),
        concepts,
        meta: { ...(input.meta || {}), page: block.page, rows: rows.length },
      })
      continue
    }
    if (block.kind === 'code') {
      flush()
      const text = String(block.text || '').trim()
      if (!text) continue
      ordinal += 1
      chunks.push({
        id: chunkId(input.sourceId, ordinal),
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        kind: 'code',
        ordinal,
        text: trimTo(text, DEFAULT_MAX),
        concepts,
        meta: { ...(input.meta || {}), page: block.page },
      })
      continue
    }

    const text = String(block.text || block.caption || '').trim()
    if (!text) continue
    buffer.push(text)
    bufferLength += text.length
    if (bufferLength >= DEFAULT_TARGET) flush()
  }
  flush()
  return chunks
}

/**
 * Chunk timed transcript segments into windows a lesson can cite.
 * @param {{sourceId:string, sourceTitle:string, segments:ReadonlyArray<{startSec:number,endSec:number,text:string}>, windowSeconds?:number, meta?:object}} input
 */
export function chunkTranscript(input) {
  const windowSeconds = Number(input.windowSeconds || 45)
  const segments = Array.isArray(input.segments) ? input.segments : []
  const chunks = []
  let ordinal = 0
  let windowStart = null
  let windowEnd = null
  let texts = []

  const flush = () => {
    if (texts.length === 0 || windowStart === null) return
    ordinal += 1
    chunks.push({
      id: chunkId(input.sourceId, ordinal),
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      kind: 'transcript',
      ordinal,
      text: trimTo(texts.join(' '), DEFAULT_MAX),
      concepts: [],
      tsStart: windowStart,
      tsEnd: windowEnd,
      meta: { ...(input.meta || {}) },
    })
    texts = []
    windowStart = null
    windowEnd = null
  }

  for (const segment of segments) {
    if (!segment || !segment.text) continue
    if (windowStart === null) windowStart = Number(segment.startSec || 0)
    windowEnd = Number(segment.endSec || windowStart)
    texts.push(String(segment.text).trim())
    if (windowEnd - windowStart >= windowSeconds) flush()
  }
  flush()
  return chunks
}

/** Chunk a slide deck: one chunk per slide, with its page render reference. */
export function chunkSlides(input) {
  const chunks = []
  const slides = Array.isArray(input.slides) ? input.slides : []
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index]
    const text = String(slide?.text || '').trim()
    if (!text) continue
    chunks.push({
      id: chunkId(input.sourceId, index + 1),
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      kind: 'slide',
      ordinal: index + 1,
      text: trimTo(text, DEFAULT_MAX),
      concepts: [],
      meta: { ...(input.meta || {}), slide: index + 1 },
    })
  }
  return chunks
}

/** Chunk PDF pages (text per page, plus an optional render reference). */
export function chunkPdfPages(input) {
  const chunks = []
  const pages = Array.isArray(input.pages) ? input.pages : []
  let ordinal = 0
  for (const page of pages) {
    const text = String(page?.text || '').trim()
    if (!text) continue
    const pieces = []
    let buffer = ''
    for (const paragraph of text.split(/\n{2,}/)) {
      const clean = paragraph.replace(/\s+/g, ' ').trim()
      if (!clean) continue
      if (buffer.length + clean.length > DEFAULT_MAX && buffer) {
        pieces.push(buffer)
        buffer = ''
      }
      buffer = buffer ? `${buffer} ${clean}` : clean
    }
    if (buffer) pieces.push(buffer)
    for (const piece of pieces) {
      ordinal += 1
      chunks.push({
        id: chunkId(input.sourceId, ordinal),
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        kind: 'page',
        ordinal,
        text: trimTo(piece, DEFAULT_MAX),
        concepts: [],
        meta: { ...(input.meta || {}), page: page.page },
      })
    }
  }
  return chunks
}

/** Chunk arbitrary text (web page, pasted notes). */
export function chunkText(input) {
  const text = String(input.text || '')
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  const chunks = []
  let ordinal = 0
  let buffer = []
  let length = 0
  const flush = () => {
    if (buffer.length === 0) return
    const joined = buffer.join('\n').trim()
    buffer = []
    length = 0
    if (!joined) return
    ordinal += 1
    chunks.push({
      id: chunkId(input.sourceId, ordinal),
      sourceId: input.sourceId,
      sourceTitle: input.sourceTitle,
      kind: 'para',
      ordinal,
      text: trimTo(joined, DEFAULT_MAX),
      concepts: [],
      meta: { ...(input.meta || {}) },
    })
  }
  for (const paragraph of paragraphs.length ? paragraphs : [text]) {
    buffer.push(paragraph)
    length += paragraph.length
    if (length >= DEFAULT_TARGET) flush()
  }
  flush()
  return chunks
}

/** Concept ids whose label appears in the chunk text. */
export function tagConcepts(chunk, graphNodes) {
  const text = String(chunk.text || '')
  const hits = []
  for (const node of graphNodes || []) {
    const label = String(node.label || '').trim()
    if (!label || label.length < 2) continue
    if (text.includes(label)) hits.push(node.id)
  }
  return hits.length > 0 ? hits : chunk.concepts || []
}
