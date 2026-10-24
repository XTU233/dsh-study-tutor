/**
 * Media pipeline: probe, scene slicing, key frames, audio chunking and speech
 * recognition. Every step returns a plain JSON-able value and reports a
 * degradation instead of throwing, so a missing engine only loses one feature.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ensureDir, readText } from './paths.js'
import { run } from './proc.js'

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.ts', '.m4v', '.mpg', '.mpeg', '.3gp', '.mts', '.m2ts', '.ogv'])
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma', '.amr', '.aiff', '.aif', '.ape'])
const SUB_EXT = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc'])

const FRAME_PATTERN = /^shot_\d+\.jpg$/
const AUDIO_PATTERN = /^audio_\d+\.wav$/

/** Classify one media path by extension. */
export function mediaKind(path) {
  const extension = extname(path).toLowerCase()
  if (VIDEO_EXT.has(extension)) return 'video'
  if (AUDIO_EXT.has(extension)) return 'audio'
  if (SUB_EXT.has(extension)) return 'subtitle'
  return null
}

/** Content hash used as the media cache key. */
export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 32)
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100
}

function parseFps(value) {
  if (typeof value !== 'string' || !value.includes('/')) return 0
  const [num, den] = value.split('/').map(Number)
  if (!den) return 0
  return Math.round((num / den) * 100) / 100
}

function removeMatching(directory, pattern) {
  for (const name of readdirSync(directory)) {
    if (!pattern.test(name)) continue
    try {
      unlinkSync(join(directory, name))
    } catch {
      /* best effort */
    }
  }
}

/** ffprobe the container: duration, streams, audio presence. */
export async function probeMedia(engines, path) {
  if (!engines.available.ffprobe) {
    return { ok: false, code: 'FFPROBE_UNAVAILABLE', message: 'ffprobe is not available.' }
  }
  const result = await run(engines.ffprobe, [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    path,
  ], { timeoutMs: 120000 })
  if (result.code !== 0) {
    return { ok: false, code: 'FFPROBE_FAILED', message: (result.stderr || result.stdout || 'ffprobe failed').slice(0, 800) }
  }
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch (error) {
    return { ok: false, code: 'FFPROBE_BAD_OUTPUT', message: String(error) }
  }
  const streams = Array.isArray(parsed.streams) ? parsed.streams : []
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const subtitle = streams.find((stream) => stream.codec_type === 'subtitle')
  const duration = Number(parsed.format?.duration ?? video?.duration ?? 0) || 0
  return {
    ok: true,
    duration,
    format: parsed.format?.format_name,
    bytes: Number(parsed.format?.size || 0),
    width: Number(video?.width || 0),
    height: Number(video?.height || 0),
    fps: parseFps(video?.avg_frame_rate),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    hasSubtitle: Boolean(subtitle),
    audioChannels: Number(audio?.channels || 0),
    audioRate: Number(audio?.sample_rate || 0),
    streams: streams.map((stream) => ({
      type: stream.codec_type,
      codec: stream.codec_name,
      language: stream.tags?.language,
    })),
  }
}

/**
 * Scene slicing plus key frames.
 * @param {object} engines resolved engines
 * @param {string} path source file
 * @param {{workDir:string, threshold?:number, intervalSec?:number, maxShots?:number, startSec?:number, endSec?:number, duration?:number}} options
 */
export async function extractShots(engines, path, options) {
  if (!engines.available.ffmpeg) {
    return { ok: false, code: 'FFMPEG_UNAVAILABLE', message: 'ffmpeg is not available.' }
  }
  const workDir = options.workDir
  ensureDir(workDir)
  removeMatching(workDir, FRAME_PATTERN)

  const threshold = Number(options.threshold ?? 0.35)
  const maxShots = Math.max(2, Math.min(200, Number(options.maxShots ?? 40)))
  const duration = Number(options.duration || 0)
  const start = Math.max(0, Number(options.startSec || 0))
  const end = Number(options.endSec || 0) > 0 ? Number(options.endSec) : duration
  const rangeArgs = []
  if (start > 0) rangeArgs.push('-ss', String(start))
  if (end > start) rangeArgs.push('-t', String(end - start))
  const pattern = join(workDir, 'shot_%05d.jpg')

  // Slides and whiteboards barely change between cuts, so try a few lower
  // thresholds before giving up on scene detection entirely.
  const thresholds = [...new Set([threshold, 0.12, 0.06, 0.02].filter((value) => value >= 0.001))]
  let starts = []
  let files = []
  let sceneRun = null
  let usedThreshold = threshold
  for (const candidate of thresholds) {
    removeMatching(workDir, FRAME_PATTERN)
    starts = []
    sceneRun = await run(engines.ffmpeg, [
      '-hide_banner', '-nostats',
      ...rangeArgs,
      '-i', path,
      '-vf', `select='gt(scene,${candidate})',showinfo`,
      '-fps_mode', 'vfr',
      '-q:v', '3',
      '-y', pattern,
    ], { timeoutMs: 30 * 60 * 1000 })
    const patternRe = /pts_time:([0-9.]+)/g
    let match
    while ((match = patternRe.exec(sceneRun.stderr)) !== null) starts.push(Number(match[1]) + start)
    files = readdirSync(workDir).filter((name) => FRAME_PATTERN.test(name)).sort()
    usedThreshold = candidate
    // Detection is accepted as soon as it found at least one cut: a clip with
    // a single cut is a legitimate two-shot video, and requiring two frames
    // discarded exactly that case. A single detected frame is still not enough
    // to describe the material, so it is topped up below rather than thrown
    // away.
    if (files.length >= 1) break
  }
  let mode = 'scene'

  if (files.length > 0 && starts.length === 0) {
    // Detected frames whose timestamps did not survive in stderr: keep the
    // frames, assume an even spread instead of dropping the whole result.
    starts = files.map((_, index) => start + index * 5)
  }

  // Nothing detected at all: fall back to even sampling across the span.
  if (files.length === 0) {
    removeMatching(workDir, FRAME_PATTERN)
    // Sample span: keep the frame count near maxShots even for short clips.
    const span = end > start ? end - start : duration || 60
    const intervalSec = Math.max(1, Math.min(Number(options.intervalSec || 20), Math.max(1, span / maxShots)))
    const intervalRun = await run(engines.ffmpeg, [
      '-hide_banner', '-nostats',
      ...rangeArgs,
      '-i', path,
      '-vf', `fps=1/${intervalSec}`,
      '-q:v', '3',
      '-y', pattern,
    ], { timeoutMs: 30 * 60 * 1000 })
    files = readdirSync(workDir).filter((name) => FRAME_PATTERN.test(name)).sort()
    starts.length = 0
    for (let index = 0; index < files.length; index += 1) starts.push(start + index * intervalSec)
    mode = 'interval'
    if (files.length === 0) {
      return {
        ok: false,
        code: 'NO_FRAMES',
        message: (intervalRun.stderr || sceneRun?.stderr || 'ffmpeg produced no frames').slice(-800),
        shots: [],
      }
    }
  }

  let indices = files.map((_, index) => index)
  if (indices.length > maxShots) {
    const step = indices.length / maxShots
    indices = Array.from({ length: maxShots }, (_, index) => Math.min(files.length - 1, Math.round(index * step)))
  }

  const shots = []
  for (let order = 0; order < indices.length; order += 1) {
    const position = indices[order]
    const shotStart = starts[position] ?? start
    const nextPosition = order + 1 < indices.length ? indices[order + 1] : files.length
    const shotEnd = nextPosition < files.length ? (starts[nextPosition] ?? shotStart + 5) : (end || shotStart + 5)
    shots.push({
      index: shots.length + 1,
      startSec: round(shotStart),
      endSec: round(Math.max(shotStart + 0.5, shotEnd)),
      framePath: join(workDir, files[position]),
    })
  }
  // 'scene' with a single shot means one cut was found but the rest of the
  // timeline has no sampled frame; report it as a hybrid so the caller knows
  // the timeline is only partly covered.
  if (mode === 'scene' && shots.length < 2) mode = 'scene-partial'
  return { ok: true, mode, threshold: usedThreshold, considered: files.length, shots }
}

/**
 * Split the audio track into 16 kHz mono PCM chunks small enough for the
 * speech recogniser's per-request byte limit.
 */
export async function extractAudioChunks(engines, path, options) {
  if (!engines.available.ffmpeg) {
    return { ok: false, code: 'FFMPEG_UNAVAILABLE', message: 'ffmpeg is not available.' }
  }
  const workDir = options.workDir
  ensureDir(workDir)
  removeMatching(workDir, AUDIO_PATTERN)

  const chunkSeconds = Math.max(10, Math.min(120, Number(options.chunkSeconds || 60)))
  const start = Math.max(0, Number(options.startSec || 0))
  const end = Number(options.endSec || 0)
  const rangeArgs = []
  if (start > 0) rangeArgs.push('-ss', String(start))
  if (end > start) rangeArgs.push('-t', String(end - start))
  const pattern = join(workDir, 'audio_%03d.wav')

  const result = await run(engines.ffmpeg, [
    '-hide_banner', '-nostats',
    ...rangeArgs,
    '-i', path,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-c:a', 'pcm_s16le',
    '-f', 'segment',
    '-segment_time', String(chunkSeconds),
    '-reset_timestamps', '1',
    '-y', pattern,
  ], { timeoutMs: 30 * 60 * 1000 })

  const files = readdirSync(workDir).filter((name) => AUDIO_PATTERN.test(name)).sort()
  if (files.length === 0) {
    return {
      ok: false,
      code: 'NO_AUDIO',
      message: (result.stderr || 'no audio track could be extracted').slice(-800),
      chunks: [],
    }
  }
  const chunks = files.map((name, index) => ({
    index,
    path: join(workDir, name),
    startSec: round(start + index * chunkSeconds),
    endSec: round(start + (index + 1) * chunkSeconds),
    bytes: statSync(join(workDir, name)).size,
  }))
  return { ok: true, chunkSeconds, chunks }
}

/** Pull the first embedded subtitle stream as cues. */
export async function extractEmbeddedSubtitle(engines, path, workDir) {
  if (!engines.available.ffmpeg) return null
  ensureDir(workDir)
  const target = join(workDir, 'subtitle.srt')
  const result = await run(engines.ffmpeg, [
    '-hide_banner', '-nostats',
    '-i', path,
    '-map', '0:s:0',
    '-y', target,
  ], { timeoutMs: 5 * 60 * 1000 })
  if (result.code !== 0 || !existsSync(target)) return null
  const text = readText(target)
  const cues = parseSrt(text)
  return cues.length > 0 ? cues : null
}

/** Parse SRT / VTT into timed cues. */
export function parseSrt(text) {
  const cues = []
  const blocks = String(text || '').replace(/\r/g, '').split(/\n{2,}/)
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0)
    if (lines.length < 2) continue
    const timeLine = lines.find((line) => line.includes('-->'))
    if (!timeLine) continue
    const [from, to] = timeLine.split('-->').map((part) => part.trim().split(' ')[0])
    const body = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim()
    if (!body) continue
    cues.push({ startSec: timestampToSeconds(from), endSec: timestampToSeconds(to), text: body })
  }
  return cues
}

function timestampToSeconds(value) {
  if (!value) return 0
  const parts = String(value).replace(',', '.').split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0] || 0
}

/** Find a sidecar subtitle next to a media file. */
export function findSidecarSubtitle(path) {
  const base = path.slice(0, path.length - extname(path).length)
  for (const extension of ['.srt', '.vtt', '.ass', '.ssa', '.txt', '.md']) {
    const candidate = base + extension
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** Attach a caption to each shot from the nearest cue. */
export function alignShots(shots, cues) {
  if (!Array.isArray(shots) || !Array.isArray(cues) || cues.length === 0) return shots
  return shots.map((shot) => {
    let best = null
    let bestDelta = Infinity
    for (const cue of cues) {
      const delta = Math.abs(cue.startSec - shot.startSec)
      if (delta < bestDelta) {
        bestDelta = delta
        best = cue
      }
    }
    if (best && bestDelta <= 6) return { ...shot, startSec: round(best.startSec), caption: best.text.slice(0, 200) }
    return shot
  })
}

/** Merge per-chunk transcripts into a global cue list. */
export function mergeTranscripts(chunks) {
  const segments = []
  for (const chunk of chunks) {
    if (!chunk || !chunk.text) continue
    segments.push({
      startSec: round(chunk.startSec || 0),
      endSec: round(chunk.endSec || 0),
      text: chunk.text.trim(),
      chunkIndex: chunk.index,
    })
  }
  return segments
}

/** Compact timed transcript for model consumption. */
export function formatTranscript(segments, limit = 20) {
  const head = segments.slice(0, limit).map((segment) => {
    const from = formatClock(segment.startSec)
    const to = formatClock(segment.endSec)
    return `[${from}–${to}] ${segment.text}`
  })
  return head.join('\n')
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}
