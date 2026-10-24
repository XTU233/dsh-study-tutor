/**
 * Where the plugin keeps its derived artefacts: media caches, rendered formula
 * images, exports and the vector index. Nothing here is a source of truth —
 * every directory can be deleted and rebuilt from the session log plus the
 * student's own files.
 */

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The DSH home the profile runs under, or a stable fallback. */
export function dshHome() {
  if (process.env.DSH_HOME) return process.env.DSH_HOME
  const profileDir = process.env.DSH_PROFILE_DIR
  if (profileDir) return dirname(dirname(profileDir))
  return join(homedir(), '.dsh')
}

/** Exact engine executable for this platform, if the plugin ships one. */
export function pluginRoot() {
  // This module lives in <plugin>/lib, so the package root is one level up.
  const here = dirname(fileURLToPath(import.meta.url))
  return dirname(here)
}

export function toolsDir() {
  return join(pluginRoot(), 'tools')
}

export function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true })
  return path
}

/** Normalise a session id into a directory-safe token. */
export function sessionToken(sessionId) {
  return String(sessionId || 'session').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)
}

/**
 * Resolve the writable data root.
 * @param {{dataDir?:string}} config resolved plugin config
 * @returns {string} absolute directory that exists
 */
export function dataRoot(config) {
  const candidates = []
  if (config.dataDir) candidates.push(isAbsolute(config.dataDir) ? config.dataDir : join(dshHome(), config.dataDir))
  candidates.push(join(dshHome(), 'study'))
  candidates.push(join(tmpdir(), 'dsh-study'))
  for (const candidate of candidates) {
    try {
      ensureDir(candidate)
      return candidate
    } catch {
      continue
    }
  }
  return tmpdir()
}

/** Path inside the data root, created on demand. */
export function dataPath(config, ...parts) {
  const root = dataRoot(config)
  const target = join(root, ...parts)
  ensureDir(target)
  return target
}

/** Media cache directory for one content hash. */
export function mediaDir(config, hash) {
  return dataPath(config, 'media', hash)
}

export function formulaDir(config) {
  return dataPath(config, 'formulas')
}

export function exportDir(config, sessionId) {
  return dataPath(config, 'exports', sessionToken(sessionId))
}

export function kbDir(config, sessionId) {
  return dataPath(config, 'kb', sessionToken(sessionId))
}

/**
 * The root a knowledge-base worker is given.
 *
 * scripts/kb.py joins `dataDir + "kb" + sessionId` itself, so the Host must
 * hand it the data root — not the session directory. Deriving it by stripping
 * a trailing "kb" from {@link kbDir} silently produced
 * `<root>/kb/<session>/kb/<session>` for every real session id.
 * @param {object} config resolved plugin config
 * @returns {string} the data root the worker expects
 */
export function kbRoot(config) {
  return dataRoot(config)
}

/** Reject a path that escapes its intended base. */
export function insideBase(base, candidate) {
  const resolvedBase = resolve(base)
  const resolvedCandidate = resolve(candidate)
  if (resolvedCandidate === resolvedBase) return true
  const rel = relative(resolvedBase, resolvedCandidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

/**
 * Resolve one student-supplied path, refusing traversal out of the allowed roots.
 * @param {string} path user path
 * @param {ReadonlyArray<string>} roots allowed roots
 * @returns {{ok:true,path:string}|{ok:false,message:string}}
 */
export function resolveStudentPath(path, roots) {
  if (!path || typeof path !== 'string') return { ok: false, message: 'empty path' }
  const expanded = path.replace(/^~(?=$|[\\/])/, homedir())
  const target = normalize(resolve(expanded))
  for (const root of roots) {
    if (!root) continue
    if (insideBase(root, target)) return { ok: true, path: target }
  }
  if (existsSync(target) && roots.length === 0) return { ok: true, path: target }
  return { ok: false, message: `refused to read outside the allowed roots: ${target}` }
}

/** Byte size of one file, or 0. */
export function fileSize(path) {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

/** Read a UTF-8 text file, returning '' on failure. */
export function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/** Write a UTF-8 text file, creating parents. */
export function writeText(path, text) {
  ensureDir(dirname(path))
  writeFileSync(path, text, 'utf8')
  return path
}

/** List a directory without throwing. */
export function listDir(path) {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

/** Remove one file without throwing. */
export function unlink(path) {
  try {
    if (existsSync(path)) unlinkSync(path)
  } catch {
    /* best effort */
  }
}

/** Remove a directory tree without throwing. */
export function removeTree(path) {
  try {
    if (existsSync(path)) rmSync(path, { recursive: true, force: true })
  } catch {
    /* best effort */
  }
}

export { basename, dirname, join, sep }
