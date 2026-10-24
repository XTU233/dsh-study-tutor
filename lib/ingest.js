/**
 * One ingest run: resolve the source, classify it, and hand it to the media or
 * document pipeline. The result is a plain object the tool can render, plus the
 * artefacts it cached for the knowledge base and the lesson view.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ensureDir, mediaDir, writeText } from './paths.js'
import { extractDocument, documentKind, writePageRenders } from './documents.js'
import {
  mediaKind,
  probeMedia,
  extractShots,
  extractAudioChunks,
  extractEmbeddedSubtitle,
  findSidecarSubtitle,
  parseSrt,
  alignShots,
  mergeTranscripts,
  formatTranscript,
  formatClock,
  hashFile,
} from './media.js'
import { ensureSpeechReady, transcribeBuffer } from './speech.js'
import { readTextFile } from './documents.js'
import { chunkBlocks, chunkPdfPages, chunkSlides, chunkTranscript, chunkText, tagConcepts } from './chunk.js'

const MAX_FRAMES_DEFAULT = 6
const MAX_VIDEO_SECONDS_DEFAULT = 7200

/**
 * Turn one ingest chunk input into chunks and cache them beside the source.
 * @param {object} context plugin context
 * @param {object} chunkInput shape selected by the pipeline
 * @param {string} directory media cache directory
 * @param {ReadonlyArray<object>} graphNodes graph nodes for concept tagging
 */
function buildChunks(context, chunkInput, directory, graphNodes) {
  if (!chunkInput) return { chunks: [], path: null }
  let chunks = []
  try {
    if (Array.isArray(chunkInput.segments)) chunks = chunkTranscript(chunkInput)
    else if (Array.isArray(chunkInput.slides)) chunks = chunkSlides(chunkInput)
    else if (Array.isArray(chunkInput.pages)) chunks = chunkPdfPages(chunkInput)
    else if (Array.isArray(chunkInput.blocks)) chunks = chunkBlocks(chunkInput)
    else if (typeof chunkInput.text === 'string') chunks = chunkText(chunkInput)
  } catch (error) {
    return { chunks: [], path: null, error: String(error) }
  }
  chunks = chunks.map((chunk) => ({ ...chunk, concepts: tagConcepts(chunk, graphNodes) })).filter((chunk) => chunk.text && chunk.text.trim().length > 4)
  const path = join(directory, 'chunks.json')
  writeText(path, JSON.stringify(chunks, null, 1))
  return { chunks, path }
}

/** Stable content hash for any file. */
function hashOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 32)
}

/**
 * Ingest one source file.
 * @param {object} context {engines, config, speech, attachments}
 * @param {{path:string, options?:object}} input
 */
export async function ingestSource(context, input) {
  const path = input.path
  const options = input.options || {}
  if (!path || !existsSync(path)) {
    return { ok: false, code: 'FILE_NOT_FOUND', message: `File not found: ${path}` }
  }
  let stats
  try {
    stats = statSync(path)
  } catch (error) {
    return { ok: false, code: 'FILE_UNREADABLE', message: String(error) }
  }
  if (!stats.isFile()) return { ok: false, code: 'NOT_A_FILE', message: `${path} is not a regular file` }
  const maxBytes = Number(context.config.maxFileBytes || 512 * 1024 * 1024)
  if (stats.size > maxBytes) {
    return { ok: false, code: 'FILE_TOO_LARGE', message: `File is ${stats.size} bytes, the limit is ${maxBytes}.` }
  }

  const hash = hashOf(path)
  const kind = mediaKind(path) || documentKind(path)
  const title = options.title || path.split(/[\\/]/).pop()
  const sourceId = options.sourceId || `src-${hash.slice(0, 12)}`

  if (kind === 'video' || kind === 'audio') {
    return ingestMedia(context, { path, hash, kind, title, sourceId, options, stats })
  }
  if (kind === 'subtitle') {
    const text = readTextFile(path, 400_000)
    const cues = parseSrt(text)
    const directory = mediaDir(context.config, hash)
    ensureDir(directory)
    const chunkInput = { sourceId, sourceTitle: title, segments: cues, meta: { kind: 'subtitle', path } }
    const built = buildChunks(context, chunkInput, directory, input.graphNodes || [])
    return {
      ok: true,
      sourceId,
      kind: 'subtitle',
      title,
      bytes: stats.size,
      cues,
      segments: cues,
      chunkInput,
      chunks: built.chunks,
      chunksPath: built.path,
      notices: cues.length === 0 ? ['No cues were parsed from this subtitle file.'] : [],
    }
  }
  if (kind === 'unknown') {
    return {
      ok: false,
      code: 'UNSUPPORTED_FORMAT',
      message: `Unsupported format: ${extname(path) || '(none)'}`,
    }
  }
  if (kind === 'archive') {
    return ingestArchive(context, { path, hash, title, sourceId, stats })
  }
  return ingestDocument(context, { path, hash, kind, title, sourceId, options, stats, graphNodes: input.graphNodes })
}

async function ingestDocument(context, input) {
  const directory = mediaDir(context.config, input.hash)
  ensureDir(directory)
  const renderPages = Number(input.options.renderPages || 0) || (input.kind === 'pdf' ? 8 : 0)
  const extraction = await extractDocument(context.engines, input.path, {
    workDir: directory,
    renderPages,
    dpi: Number(input.options.dpi || 130),
  })
  if (!extraction || extraction.ok === false) {
    return {
      ok: false,
      code: extraction?.code || 'EXTRACT_FAILED',
      message: extraction?.message || 'Extraction failed.',
      sourceId: input.sourceId,
      supported: extraction?.supported,
    }
  }

  const pages = writePageRenders(extraction.renders, join(directory, 'pages'))
  writeText(join(directory, 'extraction.json'), JSON.stringify({
    sourceId: input.sourceId,
    kind: extraction.kind,
    pageCount: extraction.pageCount,
    pages: pages.map((page) => ({ page: page.page, path: page.path })),
    formulas: (extraction.formulas || []).slice(0, 200),
    blocks: (extraction.blocks || []).slice(0, 400),
  }, null, 2))

  let chunkInput
  if (extraction.kind === 'pdf') {
    chunkInput = { sourceId: input.sourceId, sourceTitle: input.title, pages: extraction.pages, meta: { kind: 'pdf', path: input.path } }
  } else if (extraction.kind === 'pptx') {
    chunkInput = { sourceId: input.sourceId, sourceTitle: input.title, slides: extraction.slides, meta: { kind: 'slides', path: input.path } }
  } else {
    chunkInput = { sourceId: input.sourceId, sourceTitle: input.title, blocks: extraction.blocks, meta: { kind: extraction.kind, path: input.path } }
  }

  const preview = summarizeExtraction(extraction)
  const built = buildChunks(context, chunkInput, directory, input.graphNodes || [])
  return {
    ok: true,
    sourceId: input.sourceId,
    kind: extraction.kind,
    title: input.title,
    bytes: input.stats.size,
    hash: input.hash,
    directory,
    pageCount: extraction.pageCount,
    pages,
    formulas: (extraction.formulas || []).slice(0, 40),
    blocks: preview.blocks,
    characters: preview.characters,
    truncated: preview.truncated,
    chunkInput,
    chunks: built.chunks,
    chunksPath: built.path,
    notices: [
      // The extractor knows things the Host cannot see — a missing text layer,
      // an unreadable scan — so its own notices are surfaced, not discarded.
      ...(Array.isArray(extraction.notices) ? extraction.notices : []),
      ...(pages.length > 0 ? [] : ['No page images were rendered for this document.']),
    ],
  }
}

function summarizeExtraction(extraction) {
  const blocks = Array.isArray(extraction.blocks) ? extraction.blocks : []
  let characters = 0
  for (const block of blocks) characters += String(block.text || '').length
  return {
    blocks: blocks.slice(0, 60).map((block) => ({
      kind: block.kind,
      text: typeof block.text === 'string' ? block.text.slice(0, 600) : undefined,
      level: block.level,
      page: block.page,
      rows: block.kind === 'table' ? (block.rows || []).slice(0, 8) : undefined,
      latex: block.latex,
      read: block.read,
    })),
    characters,
    truncated: blocks.length > 60,
  }
}

async function ingestMedia(context, input) {
  const engines = context.engines
  const directory = mediaDir(context.config, input.hash)
  ensureDir(directory)
  const probe = await probeMedia(engines, input.path)
  const duration = probe.ok ? probe.duration : Number(input.options.duration || 0)
  const maxSeconds = Number(context.config.maxVideoSeconds || MAX_VIDEO_SECONDS_DEFAULT)
  let startSec = Math.max(0, Number(input.options.startSec || 0))
  let endSec = Number(input.options.endSec || 0)
  let truncated = false
  if (duration > maxSeconds) {
    truncated = true
    if (!endSec || endSec > maxSeconds) endSec = maxSeconds
  }

  const notices = []
  let shots = []
  let frames = []
  if (input.kind === 'video' && input.options.extractFrames !== false && engines.available.ffmpeg) {
    const slicing = input.options.slicing || {}
    const shotRun = await extractShots(engines, input.path, {
      workDir: join(directory, 'shots'),
      threshold: slicing.threshold,
      intervalSec: slicing.intervalSec,
      maxShots: slicing.maxShots || context.config.maxShots,
      startSec,
      endSec,
      duration,
    })
    if (shotRun.ok) {
      shots = shotRun.shots
      notices.push(
        shotRun.mode === 'scene'
          ? 'Key frames taken with scene detection.'
          : shotRun.mode === 'scene-partial'
            ? 'Key frames taken with scene detection (one cut found; the rest of the timeline has no sampled frame).'
            : 'Key frames taken with fixed interval sampling.',
      )
    } else {
      notices.push(`Key frames unavailable: ${shotRun.message}`)
    }
  }

  let segments = []
  const wantTranscript = input.options.transcribe !== false
  if (wantTranscript) {
    const transcript = await transcribeMedia(context, input.path, directory, { startSec, endSec, duration, options: input.options })
    if (transcript.ok) {
      segments = transcript.segments
      if (transcript.notice) notices.push(transcript.notice)
      if (transcript.source) notices.push(`Transcript source: ${transcript.source}.`)
    } else {
      notices.push(`Transcript unavailable: ${transcript.message}`)
    }
  }

  if (segments.length > 0) shots = alignShots(shots, segments)

  const transcriptPath = join(directory, 'transcript.json')
  writeText(transcriptPath, JSON.stringify({ duration, segments, shots: shots.map((shot) => ({ index: shot.index, startSec: shot.startSec, endSec: shot.endSec, caption: shot.caption, frame: shot.framePath })) }, null, 2))

  const maxFrames = Number(input.options.maxFrames || context.config.maxFramesPerCall || MAX_FRAMES_DEFAULT)
  frames = shots.slice(0, Math.max(0, maxFrames)).map((shot) => shot.framePath).filter((frame) => frame && existsSync(frame))
  const remaining = shots.slice(maxFrames)
  if (remaining.length > 0) notices.push(`${remaining.length} more key frames are cached; ask for a later time range to see them.`)

  const chunkInput = { sourceId: input.sourceId, sourceTitle: input.title, segments, meta: { kind: input.kind, path: input.path } }
  const built = buildChunks(context, chunkInput, directory, input.graphNodes || [])
  return {
    ok: true,
    sourceId: input.sourceId,
    kind: input.kind,
    title: input.title,
    bytes: input.stats.size,
    hash: input.hash,
    directory,
    probe,
    duration,
    truncated,
    continueFrom: truncated ? endSec : undefined,
    shots: shots.map((shot) => ({ index: shot.index, startSec: shot.startSec, endSec: shot.endSec, caption: shot.caption, hasFrame: Boolean(shot.framePath) })),
    frames,
    segments: segments.slice(0, 24),
    segmentCount: segments.length,
    transcriptPath,
    transcriptPreview: formatTranscript(segments, 20),
    chunkInput,
    chunks: built.chunks,
    chunksPath: built.path,
    notices,
  }
}

async function transcribeMedia(context, path, directory, options) {
  const engines = context.engines
  // 1. Embedded subtitle stream wins: exact wording and timing.
  const embedded = await extractEmbeddedSubtitle(engines, path, join(directory, 'subtitle'))
  if (embedded && embedded.length > 0) return { ok: true, segments: embedded, source: 'embedded subtitle' }

  // 2. A sidecar file next to the media.
  const sidecar = findSidecarSubtitle(path)
  if (sidecar) {
    const cues = parseSrt(readTextFile(sidecar, 800_000))
    if (cues.length > 0) return { ok: true, segments: cues, source: `sidecar ${sidecar.split(/[\\/]/).pop()}` }
  }

  // 3. Speech recognition over the extracted audio.
  const speech = context.speech
  if (!speech || typeof speech.snapshot !== 'function') {
    return { ok: false, code: 'SPEECH_UNAVAILABLE', message: 'The speech-to-text service is not mounted.' }
  }
  const snapshot = speech.snapshot()
  const providerId = (snapshot?.providers || []).some((provider) => provider.id === context.config.asrProvider)
    ? context.config.asrProvider
    : snapshot?.selection?.providerId
  if (!providerId) {
    return { ok: false, code: 'SPEECH_NO_PROVIDER', message: 'No speech provider is registered; a subtitle track or pasted transcript is needed.' }
  }

  const ready = await ensureSpeechReady(speech, providerId, { timeoutMs: Number(context.config.asrPrepareTimeoutMs || 1200000) })
  if (!ready.ok) {
    return {
      ok: false,
      code: ready.code,
      message: `${ready.message} (provider ${providerId}). The model is downloaded once; call study_ingest again afterwards.`,
      preparation: ready.preparation,
    }
  }

  const audio = await extractAudioChunks(engines, path, {
    workDir: join(directory, 'audio'),
    chunkSeconds: options.options.audioChunkSeconds || context.config.audioChunkSeconds,
    startSec: options.startSec,
    endSec: options.endSec,
  })
  if (!audio.ok) return { ok: false, code: audio.code, message: audio.message }

  const language = options.options.language || context.config.asrLanguage || 'zh'
  const controller = new AbortController()
  const transcripts = []
  for (const chunk of audio.chunks) {
    let buffer
    try {
      buffer = readFileSync(chunk.path)
    } catch (error) {
      transcripts.push({ ...chunk, text: '', error: String(error) })
      continue
    }
    const result = await transcribeBuffer(speech, providerId, new Uint8Array(buffer), language, controller.signal)
    transcripts.push({
      index: chunk.index,
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      text: result.ok ? result.text : '',
      error: result.ok ? undefined : result.message,
    })
  }
  const usable = transcripts.filter((item) => item.text && item.text.trim().length > 0)
  if (usable.length === 0) {
    // Report why each chunk produced nothing. Without this the notice reads
    // "returned no text" and the real cause (an unsupported language hint, a
    // byte limit, a provider error) is invisible to the caller.
    const failures = transcripts
      .map((item) => `chunk ${item.index} (${item.startSec}-${item.endSec}s): ${item.error || 'empty text'}`)
      .slice(0, 5)
    return {
      ok: false,
      code: 'SPEECH_EMPTY',
      message: `Speech recognition returned no text (${transcripts.length} chunks, language "${language}"). ${failures.join('; ')}`,
    }
  }
  const segments = mergeTranscripts(usable)
  return { ok: true, segments, source: 'speech recognition' }
}

async function ingestArchive(context, input) {
  const directory = mediaDir(context.config, input.hash)
  ensureDir(directory)
  const listing = await extractDocument(context.engines, input.path, { workDir: directory })
  const entries = Array.isArray(listing.entries) ? listing.entries : []
  return {
    ok: true,
    sourceId: input.sourceId,
    kind: 'archive',
    title: input.title,
    bytes: input.stats.size,
    hash: input.hash,
    directory,
    entries: entries.slice(0, 100),
    entryCount: entries.length,
    notices: [
      entries.length > 0
        ? 'Extract the archive yourself (or ask for a member path) and ingest that member.'
        : 'Archive listing produced no entries.',
    ],
    chunkInput: null,
  }
}
