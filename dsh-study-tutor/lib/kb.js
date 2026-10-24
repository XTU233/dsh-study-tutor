/**
 * Knowledge-base bridge. The Host owns chunk selection and citation mapping;
 * the Python worker owns indexing, embedding and retrieval.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { kbRoot } from './paths.js'
import { pythonEnv } from './engines.js'
import { runWorker } from './proc.js'

function workerPath(engines) {
  return join(engines.pluginRoot, 'scripts', 'kb.py')
}

/**
 * Build or update the session index.
 * @param {object} context plugin context
 * @param {string} sessionId session whose material is indexed
 * @param {ReadonlyArray<object>} chunks chunk list
 * @param {{mode?:'build'|'update', sourceIds?:ReadonlyArray<string>}} options
 */
export async function buildIndex(context, sessionId, chunks, options = {}) {
  const engines = context.engines
  if (!engines.available.python) {
    return { ok: false, code: 'PYTHON_UNAVAILABLE', message: 'The bundled Python runtime could not be started.' }
  }
  const script = workerPath(engines)
  if (!existsSync(script)) return { ok: false, code: 'KB_WORKER_MISSING', message: `kb worker not found at ${script}` }
  // The caller keeps the session directory for diagnostics; the worker is
  // handed the data root because it re-joins kb/<session> itself.
  const reply = await runWorker(script, {
    op: 'build',
    dataDir: kbRoot(context.config),
    sessionId: String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_'),
    mode: options.mode || 'build',
    sourceIds: options.sourceIds,
    modelDir: engines.modelDir,
    chunks: chunks.map((chunk) => ({
      id: chunk.id,
      sourceId: chunk.sourceId,
      sourceTitle: chunk.sourceTitle,
      kind: chunk.kind,
      ordinal: chunk.ordinal,
      text: chunk.text,
      concepts: chunk.concepts,
      meta: chunk.meta,
      tsStart: chunk.tsStart,
      tsEnd: chunk.tsEnd,
    })),
  }, {
    python: engines.python,
    env: pythonEnv(engines),
    timeoutMs: 20 * 60 * 1000,
  })
  if (!reply || reply.ok === false) {
    return {
      ok: false,
      code: reply?.code || 'KB_BUILD_FAILED',
      message: reply?.message || 'The knowledge-base worker failed.',
    }
  }
  return reply
}

/**
 * Hybrid search over the session index.
 * @param {object} context plugin context
 * @param {string} sessionId session to search
 * @param {{query:string, topK?:number, gapConcepts?:ReadonlyArray<string>, filters?:object, mmr?:boolean}} request
 */
export async function searchIndex(context, sessionId, request) {
  const engines = context.engines
  if (!engines.available.python) {
    return { ok: false, code: 'PYTHON_UNAVAILABLE', message: 'The bundled Python runtime could not be started.' }
  }
  const script = workerPath(engines)
  // The caller keeps the session directory for diagnostics; the worker is
  // handed the data root because it re-joins kb/<session> itself.
  const reply = await runWorker(script, {
    op: 'search',
    dataDir: kbRoot(context.config),
    sessionId: String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_'),
    modelDir: engines.modelDir,
    query: request.query,
    topK: request.topK || 8,
    gapConcepts: request.gapConcepts || [],
    filters: request.filters || {},
    mmr: request.mmr !== false,
  }, {
    python: engines.python,
    env: pythonEnv(engines),
    timeoutMs: 5 * 60 * 1000,
  })
  if (!reply || reply.ok === false) {
    return {
      ok: false,
      code: reply?.code || 'KB_SEARCH_FAILED',
      message: reply?.message || 'The knowledge-base worker failed.',
    }
  }
  return reply
}

/** Index statistics for the state view and the status mode. */
export async function indexStatus(context, sessionId) {
  const engines = context.engines
  if (!engines.available.python) return { exists: false, reason: 'python-unavailable' }
  const script = workerPath(engines)
  // The caller keeps the session directory for diagnostics; the worker is
  // handed the data root because it re-joins kb/<session> itself.
  const reply = await runWorker(script, {
    op: 'status',
    dataDir: kbRoot(context.config),
    sessionId: String(sessionId).replace(/[^A-Za-z0-9._-]/g, '_'),
  }, {
    python: engines.python,
    env: pythonEnv(engines),
    timeoutMs: 60 * 1000,
  })
  if (!reply || reply.ok === false) return { exists: false, reason: reply?.message || 'worker failed' }
  return reply
}

