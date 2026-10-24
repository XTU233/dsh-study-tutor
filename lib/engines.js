/**
 * Discovery and self-check of the external engines the media and document
 * pipelines need. Every engine is optional: a failure degrades one capability
 * and is reported in `capabilities`, never thrown.
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { dshHome, pluginRoot, toolsDir } from './paths.js'
import { run } from './proc.js'

/** Candidate DSH resource directories, in order. */
function resourceRoots() {
  const roots = []
  const add = (value) => {
    if (typeof value === 'string' && value.trim() && !roots.includes(value.trim())) roots.push(value.trim())
  }
  add(process.resourcesPath)
  add(process.env.DSH_RESOURCES)
  try {
    add(join(dirname(process.execPath), 'resources'))
  } catch {
    /* no executable path */
  }
  return roots
}

/** Engine paths that ship with the plugin, the profile, or the machine. */
export function engineCandidates(config, os = process.platform) {
  const root = pluginRoot()
  const tools = toolsDir()
  const exe = os === 'win32' ? '.exe' : ''
  const bundledPython = join(dshHome(), 'dsh-runtimes')
  const libreofficeCandidates = []
  for (const resources of resourceRoots()) {
    libreofficeCandidates.push(join(resources, 'app.asar.unpacked', 'dsh', 'node_modules', '@deepseek-ai', 'libreoffice-kit', 'lib', 'cli.js'))
  }
  return {
    ffmpeg: [
      config.ffmpegDir && join(config.ffmpegDir, `ffmpeg${exe}`),
      join(tools, 'ffmpeg', `ffmpeg${exe}`),
      process.env.FFMPEG_HOME && join(process.env.FFMPEG_HOME, `ffmpeg${exe}`),
      `ffmpeg${exe}`,
    ].filter(Boolean),
    ffprobe: [
      config.ffmpegDir && join(config.ffmpegDir, `ffprobe${exe}`),
      join(tools, 'ffmpeg', `ffprobe${exe}`),
      process.env.FFMPEG_HOME && join(process.env.FFMPEG_HOME, `ffprobe${exe}`),
      `ffprobe${exe}`,
    ].filter(Boolean),
    pandoc: [
      config.pandocPath,
      join(tools, 'pandoc', `pandoc${exe}`),
      join(tools, 'pylib', 'pypandoc', 'files', `pandoc${exe}`),
      `pandoc${exe}`,
    ].filter(Boolean),
    python: [
      config.pythonPath,
      join(tools, 'python', `python${exe}`),
      process.env.DSH_PYTHON,
      join(bundledPython, 'dsh-primary-runtime', 'dependencies', 'python', `python${exe}`),
      join(dshHome(), 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'python', `python${exe}`),
      `python${exe}`,
    ].filter(Boolean),
    libreofficeCli: [
      config.libreofficeCli,
      process.env.DSH_LIBREOFFICE_CLI,
      ...libreofficeCandidates,
    ].filter(Boolean),
    node: [
      process.execPath,
      ...resourceRoots().map((resources) => join(resources, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin', `node${exe}`)),
    ].filter(Boolean),
    modelDir: [config.modelDir, join(tools, 'model', 'bge-small-zh')].filter(Boolean),
    pythonPath: join(tools, 'pylib'),
    pluginRoot: root,
  }
}

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate === 'ffmpeg' || candidate === 'ffprobe' || candidate === 'pandoc' || candidate === 'python.exe' || candidate === 'python') {
      return candidate
    }
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

const cache = new Map()

/**
 * Resolve and verify every engine once, then reuse the result.
 * @param {object} config resolved plugin config
 * @param {{force?:boolean}} [options]
 */
export async function resolveEngines(config, options = {}) {
  const key = JSON.stringify({ ffmpegDir: config.ffmpegDir, pandocPath: config.pandocPath, pythonPath: config.pythonPath, modelDir: config.modelDir })
  if (!options.force && cache.has(key)) return cache.get(key)
  const candidates = engineCandidates(config)
  const engines = {
    pluginRoot: candidates.pluginRoot,
    ffmpeg: firstExisting(candidates.ffmpeg),
    ffprobe: firstExisting(candidates.ffprobe),
    pandoc: firstExisting(candidates.pandoc),
    python: firstExisting(candidates.python),
    libreofficeCli: firstExisting(candidates.libreofficeCli),
    node: firstExisting(candidates.node),
    modelDir: firstExisting(candidates.modelDir),
    pythonPath: candidates.pythonPath,
    versions: {},
    available: {},
  }

  if (engines.ffmpeg) {
    const result = await run(engines.ffmpeg, ['-version'], { timeoutMs: 20000 })
    const match = /ffmpeg version (\S+)/.exec(result.stdout)
    engines.available.ffmpeg = result.code === 0 && Boolean(match)
    if (match) engines.versions.ffmpeg = match[1]
  } else {
    engines.available.ffmpeg = false
  }
  if (engines.ffprobe) {
    const result = await run(engines.ffprobe, ['-version'], { timeoutMs: 20000 })
    engines.available.ffprobe = result.code === 0 && /ffprobe version/.test(result.stdout)
  } else {
    engines.available.ffprobe = false
  }
  if (engines.pandoc) {
    const result = await run(engines.pandoc, ['--version'], { timeoutMs: 20000 })
    const match = /pandoc(?:\.exe)?\s+(\d[\w.\-+]*)/.exec(result.stdout)
    engines.available.pandoc = result.code === 0 && Boolean(match)
    if (match) engines.versions.pandoc = match[1]
  } else {
    engines.available.pandoc = false
  }
  if (engines.python) {
    const result = await run(engines.python, ['-c', 'import sys;print(sys.version.split()[0])'], { timeoutMs: 30000 })
    engines.available.python = result.code === 0 && /\d+\.\d+/.test(result.stdout)
    if (engines.available.python) engines.versions.python = result.stdout.trim()
  } else {
    engines.available.python = false
  }
  engines.available.libreoffice = Boolean(engines.libreofficeCli && engines.node && existsSync(engines.libreofficeCli))

  const result = { ...engines, fresh: true }
  cache.set(key, result)
  return result
}

/** Clear the discovery cache (used after installing an engine). */
export function forgetEngines() {
  cache.clear()
}

/** Environment for a Python worker: bundled site-packages first. */
export function pythonEnv(engines) {
  const existing = process.env.PYTHONPATH
  const path = engines.pythonPath ? [engines.pythonPath, existing].filter(Boolean).join(';') : existing
  return {
    PYTHONPATH: path || '',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1',
  }
}
