/**
 * Document extraction. The Host decides which parser applies and drives the
 * Python worker; the worker owns every third-party format library.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ensureDir, readText } from './paths.js'
import { pythonEnv } from './engines.js'
import { runWorker } from './proc.js'

export const TEXT_EXT = new Set([
  '.txt', '.text', '.md', '.markdown', '.mdx', '.rst', '.org', '.adoc',
  '.html', '.htm', '.xhtml', '.xml', '.json', '.jsonl', '.yaml', '.yml', '.toml',
  '.csv', '.tsv', '.log', '.ini', '.cfg', '.conf', '.properties',
  '.tex', '.latex', '.bib', '.sty', '.cls',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.hpp', '.cs',
  '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.sh', '.ps1', '.bat',
  '.sql', '.r', '.jl', '.lua', '.pl', '.vue', '.svelte', '.ipynb',
])

export const IMAGE_EXT = new Set([
  '.jpg', '.jpeg', '.jfif', '.png', '.webp', '.bmp', '.dib', '.tif', '.tiff',
  '.gif', '.ico', '.avif', '.pcx', '.tga', '.dds', '.jp2', '.j2k', '.psd',
  '.ppm', '.pgm', '.pnm', '.wmf', '.emf', '.heic', '.heif',
])

export const OFFICE_EXT = new Set([
  '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.xlsm', '.odt', '.ods', '.odp', '.rtf',
])

export const EBOOK_EXT = new Set(['.epub', '.mobi', '.azw3'])

export const SUBTITLE_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc'])

export const ARCHIVE_EXT = new Set(['.zip', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.7z', '.rar'])

const PDF_EXT = new Set(['.pdf'])
const SVG_EXT = new Set(['.svg'])

/** Classify one path for the ingest pipeline. */
export function documentKind(path) {
  const extension = extname(path).toLowerCase()
  if (PDF_EXT.has(extension)) return 'pdf'
  if (OFFICE_EXT.has(extension)) return 'office'
  if (EBOOK_EXT.has(extension)) return 'ebook'
  if (IMAGE_EXT.has(extension) || SVG_EXT.has(extension)) return 'image'
  if (SUBTITLE_EXT.has(extension)) return 'subtitle'
  if (ARCHIVE_EXT.has(extension)) return 'archive'
  if (TEXT_EXT.has(extension)) return 'text'
  return 'unknown'
}

/**
 * Extract one document to structured blocks plus derived artefacts.
 * @param {object} engines resolved engines
 * @param {string} path absolute source path
 * @param {{workDir:string, renderPages?:number, dpi?:number, signal?:AbortSignal}} options
 */
export async function extractDocument(engines, path, options) {
  const kind = documentKind(path)
  if (kind === 'archive') {
    return { ok: true, kind: 'archive', entries: [], blocks: [], notice: 'Archive members are handled by the Host, not by the extractor.' }
  }
  if (kind === 'unknown') {
    return {
      ok: false,
      code: 'UNSUPPORTED_FORMAT',
      message: `Unsupported format: ${extname(path) || '(no extension)'}`,
      supported: [...TEXT_EXT, ...OFFICE_EXT, ...IMAGE_EXT, '.pdf', ...EBOOK_EXT, ...SUBTITLE_EXT, ...ARCHIVE_EXT].slice(0, 80),
    }
  }
  if (!engines.available.python) {
    return { ok: false, code: 'PYTHON_UNAVAILABLE', message: 'The bundled Python runtime could not be started.' }
  }
  const script = join(engines.pluginRoot, 'scripts', 'extract.py')
  if (!existsSync(script)) {
    return { ok: false, code: 'EXTRACTOR_MISSING', message: `extractor not found at ${script}` }
  }
  const reply = await runWorker(script, {
    op: 'extract',
    path,
    renderPages: options.renderPages || 0,
    dpi: options.dpi || 130,
    pandoc: engines.available.pandoc ? engines.pandoc : undefined,
  }, {
    python: engines.python,
    env: pythonEnv(engines),
    timeoutMs: 15 * 60 * 1000,
    signal: options.signal,
  })
  if (!reply || reply.ok === false) return reply || { ok: false, code: 'EXTRACT_FAILED', message: 'no reply' }
  return reply
}

/**
 * Write page renders (PNG) from the extractor output into the media cache.
 * @returns {Array<{page:number, path:string, bytes:number}>}
 */
export function writePageRenders(renders, workDir) {
  const pages = []
  if (!Array.isArray(renders)) return pages
  ensureDir(workDir)
  for (const render of renders) {
    if (!render || !render.png) continue
    const target = join(workDir, `page_${String(render.page).padStart(4, '0')}.png`)
    writeFileSync(target, Buffer.from(render.png, 'base64'))
    pages.push({ page: render.page, path: target, bytes: statSync(target).size })
  }
  return pages
}

/** Write a base64 PNG into a directory and return its path. */
export function writePng(base64, target) {
  ensureDir(join(target, '..'))
  writeFileSync(target, Buffer.from(base64, 'base64'))
  return target
}

/** Convert HTML/SVG text into plain text blocks (no dependency). */
export function stripMarkup(markup) {
  const withoutScripts = String(markup || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
  return withBreaks.replace(/<[^>]+>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** Read a text-like file as UTF-8 with a GBK fallback, truncated. */
export function readTextFile(path, limit = 200_000) {
  const raw = readText(path)
  const text = raw || readTextAsGbk(path)
  return text.length > limit ? text.slice(0, limit) : text
}

function readTextAsGbk(path) {
  try {
    const buffer = readFileSync(path)
    return new TextDecoder('gb18030', { fatal: false }).decode(buffer)
  } catch {
    return ''
  }
}

/** List a directory's files with sizes, bounded. */
export function listFiles(directory, limit = 200) {
  try {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .slice(0, limit)
      .map((entry) => ({ name: entry.name, bytes: statSync(join(directory, entry.name)).size }))
  } catch {
    return []
  }
}
