/**
 * HTTP routes for the browser half: the study state of one session, cached
 * artefacts (transcripts, page renders, formula images), knowledge-base search
 * and the export action. Every route is same-origin only and scoped to one
 * session.
 */

import { existsSync, readFileSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { dataPath, exportDir, formulaDir, insideBase, kbDir, mediaDir, sessionToken } from './paths.js'
import { annotate } from './mathml.js'

const ROUTE_PREFIX = '/plugins/ds-study'

/** One JSON response. */
function sendJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.length),
    'cache-control': 'no-store',
  })
  response.end(body)
}

/** One binary response. */
function sendFile(response, path, contentType) {
  try {
    const data = readFileSync(path)
    response.writeHead(200, {
      'content-type': contentType,
      'content-length': String(data.length),
      'cache-control': 'no-store',
    })
    response.end(data)
    return true
  } catch {
    sendJson(response, 404, { ok: false, code: 'NOT_FOUND', message: 'Artefact not found.' })
    return false
  }
}

/** Body reader with a size cap. */
function readBody(request, limit = 2 * 1024 * 1024) {
  return new Promise((resolve) => {
    const chunks = []
    let size = 0
    request.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        resolve({ ok: false, code: 'BODY_TOO_LARGE' })
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8')
        resolve({ ok: true, value: text ? JSON.parse(text) : {} })
      } catch (error) {
        resolve({ ok: false, code: 'BAD_JSON', message: String(error) })
      }
    })
    request.on('error', () => resolve({ ok: false, code: 'BODY_ERROR' }))
  })
}

/** Whether the request comes from this page. */
function sameOrigin(request, origin) {
  const requestOrigin = request.headers.origin
  const host = request.headers.host
  if (requestOrigin) {
    try {
      const parsed = new URL(requestOrigin)
      if (origin) {
        const expected = new URL(origin)
        return parsed.host === expected.host
      }
      return host ? parsed.host === host : false
    } catch {
      return false
    }
  }
  // No Origin header: require the Host header to match the bound listener.
  if (!host) return false
  if (!origin) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function queryOf(request) {
  try {
    const url = new URL(request.url || '/', 'http://localhost')
    return url.searchParams
  } catch {
    return new URLSearchParams()
  }
}

const CONTENT_TYPES = {
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.md': 'text/markdown; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function contentTypeOf(path) {
  return CONTENT_TYPES[extname(path).toLowerCase()] || 'application/octet-stream'
}

/**
 * Register every route on a context that has `webServer`.
 * @param {object} ctx cordis context
 * @param {object} host shared host services {readStudyState, search, exportStudy, enginesFor}
 */
export function registerRoutes(ctx, host) {
  const disposers = []

  const origin = (() => {
    try {
      return ctx.webServer.getOrigin()
    } catch {
      return undefined
    }
  })()

  disposers.push(ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE_PREFIX,
    handler: async (request, response) => {
      if (!sameOrigin(request, origin)) {
        sendJson(response, 403, { ok: false, code: 'ORIGIN_REJECTED', message: 'Cross-origin study requests are not allowed.' })
        return
      }
      const url = new URL(request.url || '/', 'http://localhost')
      const path = url.pathname
      try {
        if (path === `${ROUTE_PREFIX}/state`) {
          const sessionId = url.searchParams.get('sessionId') || ''
          if (!sessionId) {
            sendJson(response, 400, { ok: false, code: 'MISSING_SESSION', message: 'sessionId is required.' })
            return
          }
          const state = await host.readStudyState(sessionId)
          if (!state.ok) {
            sendJson(response, state.status || 404, state)
            return
          }
          sendJson(response, 200, state)
          return
        }

        if (path === `${ROUTE_PREFIX}/artifact`) {
          const sessionId = url.searchParams.get('sessionId') || ''
          const kind = url.searchParams.get('kind') || ''
          const name = url.searchParams.get('name') || ''
          const mediaId = url.searchParams.get('mediaId') || ''
          if (!sessionId) {
            sendJson(response, 400, { ok: false, code: 'MISSING_SESSION', message: 'sessionId is required.' })
            return
          }
          const artifact = resolveArtifact(host.config, sessionId, kind, name, mediaId)
          if (!artifact) {
            sendJson(response, 404, { ok: false, code: 'NOT_FOUND', message: 'Artefact not found.' })
            return
          }
          sendFile(response, artifact, contentTypeOf(artifact))
          return
        }

        if (path === `${ROUTE_PREFIX}/capabilities`) {
          const engines = host.engines
          sendJson(response, 200, {
            ok: true,
            capabilities: {
              ffmpeg: engines.available.ffmpeg,
              ffprobe: engines.available.ffprobe,
              pandoc: engines.available.pandoc,
              python: engines.available.python,
              libreoffice: engines.available.libreoffice,
              versions: engines.versions,
            },
            speech: host.speechSnapshot(),
          })
          return
        }

        if (path === `${ROUTE_PREFIX}/export` && request.method === 'POST') {
          const body = await readBody(request)
          if (!body.ok) {
            sendJson(response, 400, { ok: false, code: body.code, message: body.message || 'Invalid body.' })
            return
          }
          const sessionId = String(body.value.sessionId || '')
          if (!sessionId) {
            sendJson(response, 400, { ok: false, code: 'MISSING_SESSION', message: 'sessionId is required.' })
            return
          }
          const result = await host.exportStudy(sessionId)
          sendJson(response, result.ok ? 200 : 400, result)
          return
        }

        if (path === `${ROUTE_PREFIX}/search` && request.method === 'POST') {
          const body = await readBody(request)
          if (!body.ok) {
            sendJson(response, 400, { ok: false, code: body.code, message: body.message || 'Invalid body.' })
            return
          }
          const sessionId = String(body.value.sessionId || '')
          if (!sessionId) {
            sendJson(response, 400, { ok: false, code: 'MISSING_SESSION', message: 'sessionId is required.' })
            return
          }
          const result = await host.search(sessionId, {
            query: body.value.query,
            topK: body.value.topK,
            // The browser sends the current gap concepts so retrieval can
            // bias toward them; dropping them here made that bias inert.
            gapConcepts: Array.isArray(body.value.gapConcepts) ? body.value.gapConcepts : [],
            sourceIds: Array.isArray(body.value.sourceIds) ? body.value.sourceIds : [],
          })
          sendJson(response, result.ok ? 200 : 400, result)
          return
        }

        if (path === `${ROUTE_PREFIX}/formulas` && request.method === 'POST') {
          const body = await readBody(request)
          if (!body.ok) {
            sendJson(response, 400, { ok: false, code: body.code })
            return
          }
          const items = Array.isArray(body.value.items) ? body.value.items.slice(0, 64) : []
          const converted = await annotate(host.engines.pluginRoot, items)
          sendJson(response, 200, { ok: true, items: converted })
          return
        }

        sendJson(response, 404, { ok: false, code: 'UNKNOWN_ROUTE', message: `No study route for ${path}` })
      } catch (error) {
        sendJson(response, 500, { ok: false, code: 'ROUTE_FAILED', message: String(error && error.message ? error.message : error) })
      }
    },
  }))

  return () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        /* already gone */
      }
    }
  }
}

/** Resolve one artefact path inside the data root, refusing traversal. */
export function resolveArtifact(config, sessionId, kind, name, mediaId) {
  const safeName = String(name || '').replace(/[\\/]/g, '')
  if (!safeName || safeName.includes('..')) return null
  const token = sessionToken(sessionId)
  if (kind === 'formula') {
    const directory = formulaDir(config)
    const candidate = join(directory, safeName)
    return insideBase(directory, candidate) && existsSync(candidate) ? candidate : null
  }
  if (kind === 'export') {
    const directory = exportDir(config, sessionId)
    const candidate = join(directory, safeName)
    return insideBase(directory, candidate) && existsSync(candidate) ? candidate : null
  }
  if (kind === 'media' && mediaId) {
    const safeMedia = String(mediaId).replace(/[^A-Za-z0-9._-]/g, '')
    const directory = mediaDir(config, safeMedia)
    const candidate = normalize(join(directory, safeName))
    if (!insideBase(directory, candidate)) return null
    return existsSync(candidate) ? candidate : null
  }
  if (kind === 'kb') {
    const directory = kbDir(config, sessionId)
    const candidate = join(directory, safeName)
    return insideBase(directory, candidate) && existsSync(candidate) ? candidate : null
  }
  return null
}

export { ROUTE_PREFIX, sendJson }
