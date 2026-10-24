/**
 * Attachments and local paths. The tool accepts either one: a path the student
 * typed, or a file they dropped into the chat (resolved through the session's
 * own attachment records).
 */

import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dataPath, ensureDir, resolveStudentPath } from './paths.js'

/** Extensions the ingest pipeline can read. */
const INGESTIBLE = /\.(pdf|txt|md|markdown|rst|org|adoc|html?|xhtml|xml|json|jsonl|ya?ml|toml|csv|tsv|log|ini|cfg|conf|properties|tex|latex|bib|sty|cls|docx?|pptx?|xlsx?|xlsm|odt|ods|odp|rtf|epub|mobi|azw3|srt|vtt|ass|ssa|lrc|zip|tar|gz|tgz|bz2|xz|7z|rar|mp3|wav|m4a|aac|flac|ogg|opus|wma|amr|aiff|aif|ape|mp4|mkv|avi|mov|wmv|flv|webm|ts|m4v|mpg|mpeg|3gp|mts|m2ts|ogv|jpe?g|jfif|png|webp|bmp|dib|tiff?|gif|ico|avif|pcx|tga|dds|jp2|j2k|psd|ppm|pgm|pnm|wmf|emf|heic|heif|svg|jsx?|tsx?|py|java|c|h|cpp|hpp|cs|go|rs|rb|php|swift|kt|scala|sh|ps1|bat|sql|r|jl|lua|pl|vue|svelte|ipynb)$/i

/**
 * Collect candidate file paths from the most recent user messages.
 * @param {ReadonlyArray<object>} events session events
 * @param {number} limit how many user messages to scan
 * @returns {Array<{path:string, name:string, bytes:number, source:string}>}
 */
export function scanRecentAttachments(events, limit = 8) {
  const found = []
  const seen = new Set()
  const userMessages = []
  for (let index = events.length - 1; index >= 0 && userMessages.length < limit; index -= 1) {
    const event = events[index]
    if (event?.type === 'user/message') userMessages.push(event)
  }
  for (const event of userMessages) {
    const content = event.data?.content || []
    if (!Array.isArray(content)) continue
    for (const block of content) {
      if (!block || block.type !== 'file' || !block.attachment) continue
      const name = block.attachment.name || 'attachment'
      if (!INGESTIBLE.test(name)) continue
      const key = block.attachment.attachmentId || name
      if (seen.has(key)) continue
      seen.add(key)
      found.push({
        attachment: block.attachment,
        name,
        bytes: Number(block.attachment.bytes || 0),
        source: 'chat-attachment',
      })
    }
  }
  return found
}

/**
 * Materialise one chat attachment as a readable host path.
 * @param {object} attachments `ctx.attachments`
 * @param {object} ref durable file reference
 * @param {string} config resolved config
 * @param {string} sessionId session the attachment belongs to
 */
export async function materialiseAttachment(attachments, ref, config, sessionId) {
  if (!attachments || typeof attachments.fileHostPath !== 'function') {
    return { ok: false, code: 'ATTACHMENTS_UNAVAILABLE', message: 'The attachment service is not mounted.' }
  }
  try {
    const hostPath = attachments.fileHostPath(ref)
    if (hostPath && existsSync(hostPath)) return { ok: true, path: hostPath, temporary: false }
  } catch {
    /* fall through to a copy */
  }
  try {
    const chunks = []
    for await (const chunk of attachments.readFileStream(ref)) chunks.push(Buffer.from(chunk))
    const buffer = Buffer.concat(chunks)
    const directory = dataPath(config, 'attachments', String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_'))
    ensureDir(directory)
    const target = join(directory, String(ref.name || 'attachment').replace(/[\\/:*?"<>|]/g, '_'))
    const { writeFileSync } = await import('node:fs')
    writeFileSync(target, buffer)
    return { ok: true, path: target, temporary: true }
  } catch (error) {
    return { ok: false, code: 'ATTACHMENT_READ_FAILED', message: String(error && error.message ? error.message : error) }
  }
}

/** Allowed read roots for student-supplied paths. */
export function allowedRoots(context) {
  const roots = new Set()
  const add = (value) => {
    if (typeof value === 'string' && value.trim()) roots.add(value.trim())
  }
  for (const root of context.config.allowedRoots || []) add(root)
  add(process.env.DSH_WORKSPACE_ROOT)
  add(process.cwd())
  add(context.sessionCwd)
  add(context.config.dataDir)
  add(join(context.config.dataDir || '', '..'))
  add(tmpdir())
  return [...roots].filter(Boolean)
}

/**
 * Resolve the ingest target: explicit path, or the newest matching attachment.
 * @returns {Promise<{ok:true,path:string,name:string,origin:string}|{ok:false,code:string,message:string}>}
 */
export async function resolveIngestTarget(context, args, events) {
  const explicit = typeof args.source === 'string' ? args.source.trim() : ''
  if (explicit) {
    if (/^https?:\/\//i.test(explicit)) {
      return { ok: false, code: 'URL_NOT_DOWNLOADED', message: 'Download the URL first (web_fetch) and pass the saved path; the plugin only reads local files.' }
    }
    if (existsSync(explicit)) {
      return { ok: true, path: explicit, name: explicit.split(/[\\/]/).pop() || explicit, origin: 'path' }
    }
    const resolved = resolveStudentPath(explicit, allowedRoots(context))
    if (resolved.ok) {
      if (!existsSync(resolved.path)) {
        return { ok: false, code: 'FILE_NOT_FOUND', message: `File not found: ${resolved.path}` }
      }
      return { ok: true, path: resolved.path, name: resolved.path.split(/[\\/]/).pop() || resolved.path, origin: 'path' }
    }
    return { ok: false, code: 'PATH_REFUSED', message: resolved.message }
  }

  const attachments = scanRecentAttachments(events)
  if (attachments.length === 0) {
    return {
      ok: false,
      code: 'NO_SOURCE',
      message: 'No path was given and the recent messages contain no ingestible attachment.',
    }
  }
  const index = Math.max(0, Math.min(attachments.length - 1, Number(args.attachmentIndex || 0)))
  const picked = attachments[index]
  const materialised = await materialiseAttachment(context.attachments, picked.attachment, context.config, context.sessionId)
  if (!materialised.ok) return materialised
  return { ok: true, path: materialised.path, name: picked.name, origin: 'chat-attachment', bytes: picked.bytes }
}

/** List the ingestible attachments of the recent conversation. */
export function describeAttachments(events, limit = 8) {
  return scanRecentAttachments(events, limit).map((item) => ({
    name: item.name,
    bytes: item.bytes,
    source: item.source,
  }))
}
