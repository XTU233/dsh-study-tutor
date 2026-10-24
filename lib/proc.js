/**
 * Process helpers: one bounded child-process call with UTF-8 JSON on stdin and
 * stdout, and no shell so paths with spaces or CJK characters are safe.
 */

import { spawn } from 'node:child_process'

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000
const MAX_BUFFER = 64 * 1024 * 1024

/**
 * Run one executable and collect its output.
 * @param {string} command absolute executable path
 * @param {ReadonlyArray<string>} args argv without a shell wrapper
 * @param {{stdin?: string, timeoutMs?: number, cwd?: string, env?: Record<string,string>, signal?: AbortSignal, maxBuffer?: number}} [options]
 * @returns {Promise<{code:number, stdout:string, stderr:string, timedOut:boolean}>}
 */
export function run(command, args, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS
  const maxBuffer = options.maxBuffer || MAX_BUFFER
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : process.env,
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ code: -1, stdout: '', stderr: String(error), timedOut: false })
      return
    }

    const stdout = []
    const stderr = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let timedOut = false
    let settled = false

    const timer = setTimeout(() => {
      timedOut = true
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()

    const finish = (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (options.signal && typeof options.signal.removeEventListener === 'function') {
        options.signal.removeEventListener('abort', onAbort)
      }
      resolve({
        code: typeof code === 'number' ? code : -1,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        timedOut,
      })
    }

    const onAbort = () => {
      try {
        child.kill()
      } catch {
        /* already gone */
      }
    }
    if (options.signal) {
      if (options.signal.aborted) onAbort()
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdout.on('data', (chunk) => {
      if (stdoutBytes >= maxBuffer) return
      stdoutBytes += chunk.length
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk) => {
      if (stderrBytes >= maxBuffer) return
      stderrBytes += chunk.length
      stderr.push(chunk)
    })
    child.on('error', (error) => {
      stderr.push(Buffer.from(String(error), 'utf8'))
      finish(-1)
    })
    child.on('close', (code) => finish(code))

    if (child.stdin) {
      child.stdin.on('error', () => {
        /* the child may exit before reading */
      })
      child.stdin.end(options.stdin ?? '', 'utf8')
    }
  })
}

/**
 * Run a Python worker that speaks the plugin's JSON protocol.
 * @param {string} script absolute script path
 * @param {object} request request object
 * @param {{python:string, env?:Record<string,string>, timeoutMs?:number, signal?:AbortSignal}} options
 * @returns {Promise<object>} the parsed reply, or `{ok:false, code, message}`
 */
export async function runWorker(script, request, options) {
  const env = options.env || {}
  const result = await run(options.python, [script], {
    stdin: JSON.stringify(request),
    timeoutMs: options.timeoutMs,
    signal: options.signal,
    env: { PYTHONPATH: env.PYTHONPATH || '', PYTHONIOENCODING: 'utf-8', ...env },
  })
  if (result.timedOut) {
    return { ok: false, code: 'WORKER_TIMEOUT', message: `${scriptName(script)} timed out` }
  }
  const trimmed = result.stdout.trim()
  if (!trimmed) {
    return {
      ok: false,
      code: 'WORKER_NO_OUTPUT',
      message: (result.stderr || 'the worker produced no output').slice(0, 1200),
    }
  }
  const lastLine = trimmed.split('\n').filter(Boolean).pop()
  try {
    return JSON.parse(lastLine)
  } catch {
    return {
      ok: false,
      code: 'WORKER_BAD_OUTPUT',
      message: lastLine.slice(0, 1200),
    }
  }
}

function scriptName(script) {
  const parts = String(script).split(/[\\/]/)
  return parts[parts.length - 1]
}
