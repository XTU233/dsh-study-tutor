/**
 * The agent-facing tools. Each one is a plain object accepted by
 * `ctx.tools.register`: name, description, parameter schema, output contract
 * and an execute body. The bodies delegate to lib modules so the browser half
 * and the HTTP routes can reuse exactly the same code.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PATCH_PREFIX, PATCH_SUFFIX, applyCall, boundaryBreakdown, boundaryCoverage, canLockBoundary, foldEvents, followupConcepts, graphStats, openConcepts } from './state.js'
import { describeAttachments, resolveIngestTarget } from './attachments.js'
import { ingestSource } from './ingest.js'
import { renderFormulas } from './formula.js'
import { toMathml } from './mathml.js'
import { buildIndex, searchIndex, indexStatus } from './kb.js'
import { writeExports } from './export.js'
import { dataPath, readText } from './paths.js'

const TOOL_NAMES = [
  'study_ingest',
  'study_research',
  'study_material',
  'study_boundary',
  'study_graph',
  'study_lesson',
  'study_formula',
  'study_index',
  'study_search',
  'study_state',
  'study_export',
]

/** Hidden marker appended to a tool result so the fold sees the patch. */
function withPatch(text, patch) {
  if (!patch) return text
  let json
  try {
    json = JSON.stringify(patch)
  } catch {
    return text
  }
  return `${text}\n\n${PATCH_PREFIX}${json}${PATCH_SUFFIX}`
}

function textResult(value, summary) {
  return [{ type: 'text', text: withPatch(summary, value.patch) }]
}

/**
 * The live session behind one tool call.
 *
 * The registry hands every call an `exec` carrying the calling agent; the
 * plugin's state is folded from that agent's session log, and the knowledge
 * base, exports and media cache are all scoped by the same session id. A
 * context is therefore per-call, never per-plugin: one plugin instance serves
 * every session in the profile.
 * @param {object} exec registry execution record
 * @returns {object|undefined} the calling session
 */
function sessionOf(exec) {
  return exec?.agent?.session
}

function sessionEvents(exec) {
  const session = sessionOf(exec)
  if (!session || typeof session.snapshotEvents !== 'function') return []
  try {
    return session.snapshotEvents()
  } catch {
    return []
  }
}

function stateOf(exec) {
  return foldEvents(sessionEvents(exec)).state
}

/**
 * Concrete question suggestions for the next interview round.
 *
 * A refusal to lock is only actionable if it says what to ask. Each suggestion
 * names the concept and the level the student is currently at, so the agent can
 * phrase a deeper question instead of repeating the same one.
 * @param {object} state folded study state
 * @returns {string[]} ready-to-ask prompts, most valuable first
 */
function nextQuestions(state) {
  const prompts = []
  const seen = new Set()
  const push = (text) => {
    if (!text || seen.has(text)) return
    seen.add(text)
    prompts.push(text)
  }
  const followups = followupConcepts(state)

  for (const concept of followups.unprobed.slice(0, 4)) {
    push(`「${concept.label || concept.id}」：先问「你听过这个词吗？它能解决什么问题？」确认 level 0/1`)
  }
  for (const concept of followups.belowFloor.slice(0, 6)) {
    const name = concept.label || concept.id
    const asked = concept.probedRounds || 1
    if (concept.level === 0) {
      // After two genuine attempts, more questions stop paying off: the honest
      // conclusion is "this must be taught", and saying so unblocks the lock.
      const hint = asked >= 2
        ? '；如果换角度后仍确认没基础，就把这条标 gap: true 当作「要教」的缺口'
        : ''
      push(`「${name}」（level 0，已问 ${asked} 轮）：换个角度问「如果让你向同学解释它，你会怎么说？」或先问它的前置概念${hint}`)
    } else if (concept.level === 1) {
      push(`「${name}」（level 1，已问 ${asked} 轮）：给一个最小可算的例子，问「这一步为什么这样做？」看能否在没有提示时应用；若只能在提示下复述，标 gap: true`)
    } else {
      push(`「${name}」（level ${concept.level}，已问 ${asked} 轮）：追问「如果条件变了会怎样？」确认能否举一反三`)
    }
  }
  for (const node of followups.prerequisites.slice(0, 4)) {
    push(`「${node.label || node.id}」还没问过：它出现在图谱里，先确认学生是否具备这个前置`)
  }
  return prompts
}

/**
 * The media-cache directory name for one ingested source.
 *
 * `study_ingest` caches its chunks, page renders and key frames under
 * `<dataDir>/media/<artifactId>/`, and every later stage (the knowledge-base
 * build, the export pipeline and the session panel) reaches back through this
 * id. ingest.js names that directory with the first 32 characters of the
 * file's SHA-256, so the id is recomputed here for the same file — re-reading
 * an unchanged file resolves to the same directory.
 * @param {object} result ingest result
 * @param {string} [path] the ingested file, used when the result carries no hash
 * @returns {string|undefined} the artifact directory name
 */
function artifactIdOf(result, path) {
  if (!result || typeof result !== 'object') return undefined
  if (typeof result.artifactId === 'string' && result.artifactId) return result.artifactId
  const hash = typeof result.hash === 'string' ? result.hash : ''
  if (hash) return hash.slice(0, 32)
  if (typeof path === 'string' && existsSync(path)) {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 32)
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Derive the per-call context from the plugin's base context.
 *
 * `sessionId` is the one field a tool cannot answer without: it keys the
 * knowledge base, the export directory and the media cache. Tools that read
 * `context.sessionId` therefore receive a context bound to the calling
 * session, while a call with no live session reads as `undefined` and the
 * tool fails with an actionable message instead of writing into a shared
 * directory.
 * @param {object} base plugin-level context
 * @param {object} exec registry execution record
 */
function contextFor(base, exec) {
  const session = sessionOf(exec)
  return {
    ...base,
    session,
    sessionId: session?.id,
    get sessionCwd() {
      return session?.header?.meta?.cwd
    },
  }
}

const INGEST_PARAMETERS = {
  source: {
    type: 'string',
    description: 'Absolute path of the material to read (local file). Omit to use the newest ingestible attachment in this conversation.',
  },
  attachmentIndex: {
    type: 'number',
    description: 'Which attachment to read when `source` is omitted: 0 is the newest, 1 the one before it.',
  },
  title: { type: 'string', description: 'Display title for this material.' },
  extractFrames: { type: 'boolean', description: 'Take key frames from a video (default true).' },
  transcribe: { type: 'boolean', description: 'Transcribe audio or video (default true). Subtitle tracks and sidecar files are used before speech recognition.' },
  maxFrames: { type: 'number', description: 'How many key frames to return as images in this call (default 6).' },
  renderPages: { type: 'number', description: 'How many PDF pages to render as images (default 8).' },
  startSec: { type: 'number', description: 'Start offset for long media, in seconds.' },
  endSec: { type: 'number', description: 'End offset for long media, in seconds.' },
  language: { type: 'string', description: 'Speech recognition language hint, for example zh or en.' },
}

const MATERIAL_SCHEMA = {
  type: 'array',
  description: 'Material cards. Send the complete card for each material you read.',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      id: { type: 'string', required: true, description: 'Stable id, for example mat-1.' },
      title: { type: 'string', required: true },
      kind: { type: 'string', description: 'text | pdf | slides | video | audio | image | web | other' },
      source: { type: 'string', description: 'Path, URL or course name.' },
      summary: { type: 'string' },
      difficulty: { type: 'string', description: 'beginner | guided | advanced' },
      keyTopics: { type: 'array', items: { type: 'string' } },
      gaps: { type: 'array', items: { type: 'string' }, description: 'Skipped steps or undefined prerequisites found in this material.' },
      artifacts: { type: 'string', description: 'Free-form note about cached frames, transcript or page images.' },
    },
  },
}

const PATTERN_SCHEMA = {
  type: 'array',
  description: 'Teaching moves worth borrowing from the material or the sources.',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      description: { type: 'string' },
      evidence: { type: 'string', description: 'Where this pattern came from.' },
      applyTo: { type: 'array', items: { type: 'string' } },
    },
  },
}

const BOUNDARY_SCHEMA = {
  type: 'array',
  description: 'Knowledge-boundary evidence collected in this round.',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      id: { type: 'string', required: true, description: 'Concept id, matching the graph node id.' },
      label: { type: 'string', required: true },
      level: { type: 'integer', required: true, description: '0 heard nothing | 1 can repeat | 2 applies with hints | 3 explains independently' },
      evidence: { type: 'string', description: 'The student\'s own words.' },
      confidence: { type: 'number', description: '0..1 confidence in this level.' },
      gap: {
        type: 'boolean',
        description: 'True once this concept has been probed from more than one angle and must simply be TAUGHT rather than asked again. A resolved gap counts toward the lock threshold; do not set it before asking twice.',
      },
    },
  },
}

const GRAPH_NODE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      id: { type: 'string', required: true },
      label: { type: 'string', required: true },
      summary: { type: 'string' },
      status: { type: 'string', description: 'gap | partial | ready' },
      source: { type: 'string', description: 'material | prerequisite' },
      group: { type: 'string' },
    },
  },
}

const LESSON_BLOCK_SCHEMA = {
  type: 'array',
  description: 'Structured lesson blocks. Prefer these over one long body string.',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      kind: { type: 'string', required: true, description: 'heading | para | formula | image | table | list | checkpoint | callout' },
      text: { type: 'string' },
      level: { type: 'number' },
      latex: { type: 'string' },
      read: { type: 'string' },
      alt: { type: 'string' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      items: { type: 'array', items: { type: 'string' } },
      answer: { type: 'string' },
      src: { type: 'string' },
    },
  },
}

const ANIMATION_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  properties: {
    title: { type: 'string' },
    frames: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          title: { type: 'string' },
          caption: { type: 'string' },
          durationMs: { type: 'number', description: 'Frame duration, default 2500.' },
          elements: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              properties: {
                kind: { type: 'string', required: true, description: 'box | circle | text | arrow | line | badge' },
                x: { type: 'number', required: true, description: '0..100 normalized viewport x.' },
                y: { type: 'number', required: true, description: '0..60 normalized viewport y.' },
                x2: { type: 'number' },
                y2: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
                r: { type: 'number' },
                label: { type: 'string' },
                detail: { type: 'string' },
                tone: { type: 'string', description: 'brand | ok | warn | error | idle' },
              },
            },
          },
        },
      },
    },
  },
}

const LESSON_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: true,
    properties: {
      id: { type: 'string', required: true },
      title: { type: 'string', required: true },
      goal: { type: 'string' },
      prerequisites: { type: 'array', items: { type: 'string' } },
      sources: { type: 'array', items: { type: 'string' } },
      mindmapIds: { type: 'array', items: { type: 'string' } },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            heading: { type: 'string' },
            body: { type: 'string', description: 'Legacy prose field; formulas inside $...$ are still converted.' },
            kind: { type: 'string' },
            blocks: LESSON_BLOCK_SCHEMA,
          },
        },
      },
      animation: ANIMATION_SCHEMA,
    },
  },
}

const RESEARCH_PARAMETERS = {
  queries: { type: 'array', required: true, description: 'Search queries, ideally one Chinese and one English per concept.', items: { type: 'string' } },
  concepts: { type: 'array', description: 'Concept ids this research supports.', items: { type: 'string' } },
  kind: { type: 'string', description: 'textbook | paper | course | docs | other' },
  maxSources: { type: 'number', description: 'How many sources to keep per query (default 5).' },
  recordOnly: { type: 'boolean', description: 'Only record sources you already read; do not search.' },
  sources: {
    type: 'array',
    description: 'Sources to record when recordOnly is true, or extra sources you already verified.',
    items: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string', required: true },
        title: { type: 'string', required: true },
        url: { type: 'string' },
        kind: { type: 'string' },
        trust: { type: 'number', description: '0..3' },
        notes: { type: 'string' },
        usedFor: { type: 'array', items: { type: 'string' } },
      },
    },
  },
}

const FORMULA_PARAMETERS = {
  items: {
    type: 'array',
    required: true,
    description: 'Formulas to render. Each is returned with MathML, a PNG image and a plain reading.',
    items: {
      type: 'object',
      additionalProperties: true,
      properties: {
        id: { type: 'string', required: true },
        latex: { type: 'string', required: true },
        alt: { type: 'string', description: 'Spoken form for screen readers.' },
      },
    },
  },
}

/**
 * Build every tool definition.
 * @param {object} context plugin context: {config, engines, speech, attachments, host}
 * @returns {ReadonlyArray<object>} tool definitions
 */
export function createTools(context) {
  const tools = []

  tools.push({
    name: 'study_ingest',
    description: 'Read one piece of learning material and cache everything derived from it. Accepts a local path or the newest chat attachment. Video and audio are sliced into scenes, key frames are returned as images, and speech is transcribed with timestamps. Documents of almost any format are converted into structured blocks, with formulas normalised.',
    parameters: INGEST_PARAMETERS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          sourceId: { type: 'string' },
          kind: { type: 'string' },
          title: { type: 'string' },
          characters: { type: 'number' },
          pageCount: { type: 'number' },
          duration: { type: 'number' },
          segmentCount: { type: 'number' },
          shots: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} } },
          frames: { type: 'array', items: { type: 'string' } },
          formulas: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} } },
          notices: { type: 'array', items: { type: 'string' } },
          chunks: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} } },
        },
      },
      render: (args, value) => renderIngest(value),
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const events = sessionEvents(exec)
      const target = await resolveIngestTarget(ctx, args, events)
      if (!target.ok) {
        return {
          ok: false,
          code: target.code,
          message: target.message,
          attachments: describeAttachments(events),
        }
      }
      const state = stateOf(exec)
      const result = await ingestSource(ctx, {
        path: target.path,
        graphNodes: state?.graph?.nodes || [],
        options: {
          title: args.title || target.name,
          extractFrames: args.extractFrames,
          transcribe: args.transcribe,
          maxFrames: args.maxFrames,
          renderPages: args.renderPages,
          startSec: args.startSec,
          endSec: args.endSec,
          language: args.language,
        },
      })
      if (!result.ok) {
        return {
          ok: false,
          code: result.code,
          message: result.message,
          supported: result.supported,
          notices: result.notices || [],
        }
      }
      const frames = Array.isArray(result.frames) ? result.frames : []
      const imageBlocks = await attachImages(ctx, frames, exec)
      return {
        ok: true,
        sourceId: result.sourceId,
        kind: result.kind,
        title: result.title,
        origin: target.origin,
        characters: result.characters,
        pageCount: result.pageCount,
        duration: result.duration,
        segmentCount: result.segmentCount,
        transcriptPreview: result.transcriptPreview,
        shots: (result.shots || []).slice(0, 60),
        frames,
        pages: (result.pages || []).slice(0, 12),
        formulas: (result.formulas || []).slice(0, 20),
        blocks: (result.blocks || []).slice(0, 40),
        chunkCount: (result.chunks || []).length,
        continueFrom: result.continueFrom,
        notices: result.notices || [],
        _images: imageBlocks,
        _chunks: result.chunks || [],
        _directory: result.directory,
        // Register the ingested source as a material card. Without this the
        // source never enters the folded state, and both the material list and
        // the knowledge-base build (which reads each card's artifactId) have
        // nothing to work from.
        _patch: {
          materials: [
            {
              id: result.sourceId,
              title: result.title,
              kind: result.kind,
              source: target.path,
              artifactId: artifactIdOf(result, target.path),
              summary: String(result.transcriptPreview || result.characters || '').slice(0, 400),
              keyTopics: [],
              gaps: [],
              chars: result.characters,
              pageCount: result.pageCount,
              duration: result.duration,
              origin: target.origin,
            },
          ],
        },
      }
    },
    presentCall: (args) => ({
      card: 'generic',
      title: 'Reading material',
      kind: 'read',
      rawInput: args,
    }),
    presentResult: (args, result) => ({
      card: 'generic',
      title: 'Material read',
      content: result?.content,
    }),
  })

  tools.push({
    name: 'study_research',
    description: 'Search or record authoritative sources for the concepts being taught, then store them so lessons can cite them. Prefer national textbooks, classic monographs, peer-reviewed papers and well-known open courses over blog posts.',
    parameters: RESEARCH_PARAMETERS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          sources: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} } },
          searched: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
      render: (args, value) => renderResearch(value),
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const sources = Array.isArray(args.sources) ? args.sources : []
      const recorded = []
      const searched = []
      const queries = Array.isArray(args.queries) ? args.queries.filter(Boolean).slice(0, 6) : []
      if (!args.recordOnly && queries.length > 0 && ctx.host.web) {
        const limit = Math.max(1, Math.min(8, Number(args.maxSources || ctx.config.researchMaxSources || 5)))
        for (const query of queries) {
          try {
            const result = await ctx.host.web.search({ query, maxResults: limit })
            for (const source of result?.sources || []) {
              searched.push({
                id: `src-${Math.random().toString(36).slice(2, 8)}`,
                title: source.title || source.url,
                url: source.url,
                kind: args.kind || 'other',
                trust: 1,
                notes: source.snippet || '',
                usedFor: args.concepts || [],
                query,
              })
            }
          } catch (error) {
            searched.push({
              id: 'error',
              title: '搜索失败',
              kind: 'other',
              trust: 0,
              notes: `${query}: ${String(error).slice(0, 200)}`,
            })
          }
        }
      }
      for (const source of sources) {
        if (!source || !source.id) continue
        recorded.push({
          id: source.id,
          title: source.title || source.url || source.id,
          url: source.url,
          kind: source.kind || args.kind || 'other',
          trust: Math.max(0, Math.min(3, Number(source.trust ?? 2))),
          notes: source.notes,
          usedFor: source.usedFor || args.concepts || [],
        })
      }
      const all = [...recorded, ...searched]
      return {
        ok: true,
        searched: searched.length > 0,
        sources: all,
        message: all.length === 0
          ? 'No sources were searched or recorded.'
          : `${recorded.length} recorded, ${searched.length} from search. Read a promising source with web_fetch before trusting it.`,
        _patch: { sources: all, research: [{ queries, concepts: args.concepts }] },
      }
    },
  })

  tools.push({
    name: 'study_material',
    description: 'Record material cards and the teaching patterns worth borrowing from the material or from the sources you read.',
    parameters: {
      materials: MATERIAL_SCHEMA,
      teachingPatterns: PATTERN_SCHEMA,
      mode: { type: 'string', description: 'append (default) merges by id; replace overwrites the whole list.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          materials: { type: 'integer', required: true },
          patterns: { type: 'integer', required: true },
          message: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const state = stateOf(exec)
      return {
        ok: true,
        materials: (state.materials || []).length,
        patterns: (state.teachingPatterns || []).length,
        message: `Recorded ${(args.materials || []).length} material card(s) and ${(args.teachingPatterns || []).length} teaching pattern(s).`,
      }
    },
  })

  tools.push({
    name: 'study_boundary',
    description: 'Record knowledge-boundary evidence for one round of questions. Levels: 0 heard nothing, 1 can repeat it, 2 applies with hints, 3 explains independently. Set lock true once every core concept has evidence.',
    parameters: {
      concepts: BOUNDARY_SCHEMA,
      mode: { type: 'string', description: 'append (default) or replace' },
      lock: { type: 'boolean', description: 'True once the interview is complete; unlocks the knowledge-base build.' },
      note: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          total: { type: 'integer', required: true },
          confirmed: { type: 'integer', required: true },
          ratio: { type: 'number', required: true },
          locked: { type: 'boolean', required: true },
          message: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const state = stateOf(exec)
      // Fold this call's concepts first so the gates below judge the result of
      // the round that just finished, not the state before it.
      if (Array.isArray(args.concepts) && args.concepts.length > 0) {
        applyCall(state, 'study_boundary', { concepts: args.concepts, mode: args.mode })
      }
      const coverage = boundaryCoverage(state)
      const followups = followupConcepts(state)
      const breakdown = boundaryBreakdown(state)
      const rounds = state.interviewRounds || 0
      const lines = [
        `第 ${rounds} 轮问询已记录：已探明 ${coverage.confirmed}/${coverage.total} 个概念达到 level ≥ 2（${Math.round(coverage.ratio * 100)}%）。`,
      ]
      lines.push(
        `分布：完全没听过 ${breakdown.heard} · 听过能复述 ${breakdown.hints} · 能独立应用 ${breakdown.independent}` +
        (breakdown.unknown ? ` · 尚未记录 ${breakdown.unknown}` : ''),
      )

      if (args.lock === true) {
        const gate = canLockBoundary(state)
        if (gate.ok) {
          lines.push('')
          lines.push('边界已锁定，可以开始建图与建库。')
          return {
            ok: true,
            total: coverage.total,
            confirmed: coverage.confirmed,
            ratio: Math.round(coverage.ratio * 100) / 100,
            locked: true,
            rounds,
            breakdown,
            message: lines.join('\n'),
            _patch: { locked: true, interviewRounds: rounds },
          }
        }
        // Refuse the lock and say exactly what to ask next.
        lines.push('')
        lines.push(`边界还不能锁定，原因：`)
        for (const reason of gate.reasons) lines.push(`- ${reason}`)
        lines.push('')
        lines.push('建议下一轮问这些：')
        for (const item of nextQuestions(state).slice(0, 6)) lines.push(`- ${item}`)
        return {
          ok: false,
          total: coverage.total,
          confirmed: coverage.confirmed,
          ratio: Math.round(coverage.ratio * 100) / 100,
          locked: false,
          rounds,
          breakdown,
          message: lines.join('\n'),
          _patch: { locked: false, interviewRounds: rounds },
        }
      }

      // Not locking: report where the interview stands and what is still open.
      if (followups.belowFloor.length > 0) {
        lines.push('')
        lines.push(`以下概念还停留在 level < 2，值得再追问（或问它的前置）：`)
        for (const concept of followups.belowFloor.slice(0, 8)) {
          const asked = concept.probedRounds || 1
          lines.push(`- ${concept.label || concept.id}（level ${concept.level}，已问 ${asked} 轮）`)
        }
      }
      if (followups.unprobed.length > 0) {
        lines.push('')
        lines.push(`以下概念还没有任何等级记录：`)
        for (const concept of followups.unprobed.slice(0, 8)) lines.push(`- ${concept.label || concept.id}`)
      }
      if (followups.prerequisites.length > 0) {
        lines.push('')
        lines.push(`图谱里还有 ${followups.prerequisites.length} 个节点没被问过：`)
        for (const node of followups.prerequisites.slice(0, 8)) lines.push(`- ${node.label || node.id}`)
      }
      lines.push('')
      lines.push('请继续多轮问询：每轮 3–6 题，先把 level < 2 的概念往下挖一层，再复查有无遗漏，然后再次调用 study_boundary。')
      return {
        ok: true,
        total: coverage.total,
        confirmed: coverage.confirmed,
        ratio: Math.round(coverage.ratio * 100) / 100,
        locked: Boolean(state.boundaryLocked),
        rounds,
        breakdown,
        message: lines.join('\n'),
        _patch: { locked: false, interviewRounds: rounds },
      }
    },
  })

  tools.push({
    name: 'study_graph',
    description: 'Write the prerequisite knowledge graph: nodes for concepts (mark each as gap, partial or ready), edges where `from` is the prerequisite of `to`, and focus listing the order to fill the gaps.',
    parameters: {
      nodes: GRAPH_NODE_SCHEMA,
      edges: {
        type: 'array',
        description: 'Prerequisite edges: from → to.',
        items: {
          type: 'object',
          additionalProperties: true,
          properties: {
            from: { type: 'string', required: true },
            to: { type: 'string', required: true },
          },
        },
      },
      focus: { type: 'array', items: { type: 'string' }, description: 'Node ids in the order the student should fill them.' },
      mode: { type: 'string', description: 'append (default) or replace' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          nodes: { type: 'integer', required: true },
          edges: { type: 'integer', required: true },
          stats: { type: 'object', additionalProperties: true, properties: {} },
          message: { type: 'string', required: true },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const state = stateOf(exec)
      const stats = graphStats(state)
      const cycles = detectCycles(state.graph)
      const lines = [
        `Graph: ${stats.total} nodes (${stats.ready} ready, ${stats.partial} partial, ${stats.gap} gap), ${(state.graph?.edges || []).length} edges.`,
      ]
      if (cycles.length > 0) lines.push(`Warning: cycle detected (${cycles.slice(0, 4).join('; ')}).`)
      lines.push('Next concepts to fill: ' + ((state.graph?.focus || []).slice(0, 6).join('、') || 'none yet'))
      return {
        ok: true,
        nodes: stats.total,
        edges: (state.graph?.edges || []).length,
        stats,
        message: lines.join('\n'),
      }
    },
  })

  tools.push({
    name: 'study_lesson',
    description: 'Write one lesson for one concept. Use structured blocks (heading, para, formula, table, list, checkpoint, callout) instead of one long body. Any concept whose original material skipped steps should also carry an animation of at most eight frames; frame coordinates are normalized to a 100 by 60 viewport.',
    parameters: {
      lessons: { ...LESSON_SCHEMA, required: true },
      mode: { type: 'string', description: 'append (default) or replace' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          lessons: { type: 'integer', required: true },
          formulas: { type: 'integer', required: true },
          animations: { type: 'integer', required: true },
          message: { type: 'string', required: true },
        },
      },
      render: (args, value) => renderLesson(value),
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const lessons = Array.isArray(args.lessons) ? args.lessons : []
      const formulas = collectLessonFormulas(lessons)
      let annotated = []
      if (formulas.length > 0) {
        const rendered = await renderFormulas(ctx.engines, ctx.config, formulas.map((formula, index) => ({ id: `lesson-${index}`, latex: formula })))
        annotated = rendered.items
      }
      const withMathml = []
      for (const item of annotated) {
        const converted = await toMathml(ctx.engines.pluginRoot, item.latex)
        withMathml.push({ ...item, mathml: converted?.mathml || '' })
      }
      const animations = lessons.filter((lesson) => lesson?.animation && Array.isArray(lesson.animation.frames)).length
      return {
        ok: true,
        lessons: (stateOf(exec).lessons || []).length + lessons.length,
        formulas: annotated.length,
        animations,
        mathml: withMathml.slice(0, 12),
        message: `Wrote ${lessons.length} lesson(s); ${formulas.length} formula(s) rendered; ${animations} animation(s).`,
        _formulas: withMathml,
      }
    },
  })

  tools.push({
    name: 'study_formula',
    description: 'Render formulas on demand: each LaTeX string comes back as MathML for the browser, a PNG for chat and exports, and a plain reading plus a spoken form a human can follow without a math renderer.',
    parameters: FORMULA_PARAMETERS,
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          rasterised: { type: 'boolean' },
          items: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} } },
        },
      },
      render: (args, value) => renderFormulaResult(value),
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const items = Array.isArray(args.items) ? args.items.filter((item) => item && item.latex) : []
      if (items.length === 0) return { ok: false, message: 'No formulas were supplied.' }
      const rendered = await renderFormulas(ctx.engines, ctx.config, items)
      const enriched = []
      const imageBlocks = []
      for (const item of rendered.items) {
        const converted = await toMathml(ctx.engines.pluginRoot, item.latex)
        enriched.push({ ...item, mathml: converted?.mathml || '' })
        if (item.imagePath) {
          const block = await attachImage(ctx, item.imagePath, exec)
          if (block) imageBlocks.push(block)
        }
      }
      return {
        ok: true,
        rasterised: rendered.rasterised,
        items: enriched,
        _images: imageBlocks,
        _patch: { formulas: enriched.map((item) => ({ id: item.id, latex: item.latex, read: item.read })) },
      }
    },
  })

  tools.push({
    name: 'study_index',
    description: 'Build, update, rebuild or inspect the local vector knowledge base for this session. The boundary must be locked first. Chunks are embedded with a local Chinese sentence encoder and searched with a hybrid of BM25 and vector similarity.',
    parameters: {
      mode: { type: 'string', description: 'build (replace the index) | update (re-index the given sources) | rebuild | status' },
      sourceIds: { type: 'array', items: { type: 'string' }, description: 'For update: which sources to re-index.' },
      chunks: {
        type: 'array',
        description: 'Optional pre-chunked content; omit to reuse the chunks cached by study_ingest.',
        items: { type: 'object', additionalProperties: true, properties: {} },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          mode: { type: 'string' },
          chunks: { type: 'integer' },
          embedder: { type: 'string' },
          sources: { type: 'integer' },
          seconds: { type: 'number' },
          status: { type: 'object', additionalProperties: true, properties: {} },
          message: { type: 'string' },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const state = stateOf(exec)
      const mode = String(args.mode || 'status')
      if (mode === 'status') {
        const status = await indexStatus(ctx, ctx.sessionId)
        return {
          ok: true,
          mode,
          status,
          message: status.exists
            ? `Index: ${status.chunks} chunks from ${status.sources} sources, embedder ${status.embedder}, built ${new Date((status.builtAt || 0) * 1000).toLocaleString('zh-CN')}.`
            : 'No index has been built for this session yet.',
        }
      }
      if (!state.boundaryLocked) {
        const coverage = boundaryCoverage(state)
        return {
          ok: false,
          mode,
          message: `The knowledge boundary is not locked yet (${coverage.confirmed}/${coverage.total} confirmed). Finish the interview and call study_boundary with lock: true first.`,
        }
      }
      let chunks = Array.isArray(args.chunks) && args.chunks.length > 0 ? args.chunks : collectCachedChunks(ctx, state)
      if (!Array.isArray(chunks) || chunks.length === 0) {
        return { ok: false, mode, message: 'No cached chunks were found. Call study_ingest on the material first.' }
      }
      if (mode === 'update' && Array.isArray(args.sourceIds) && args.sourceIds.length > 0) {
        chunks = chunks.filter((chunk) => args.sourceIds.includes(chunk.sourceId))
        if (chunks.length === 0) return { ok: false, mode, message: 'None of the given source ids have cached chunks.' }
      }
      const result = await buildIndex(ctx, ctx.sessionId, chunks, {
        mode: mode === 'update' ? 'update' : 'build',
        sourceIds: args.sourceIds,
      })
      if (!result.ok) return result
      return {
        ok: true,
        mode,
        chunks: result.chunks,
        embedder: result.embedder,
        seconds: result.seconds,
        message: `Index ${mode === 'update' ? 'updated' : 'built'}: ${result.chunks} chunks with ${result.embedder} in ${result.seconds}s.`,
        _patch: { index: { chunks: result.chunks, embedder: result.embedder, builtAt: Date.now() / 1000 } },
      }
    },
  })

  tools.push({
    name: 'study_search',
    description: 'Search the session knowledge base. Hybrid BM25 plus vector retrieval with optional concept and source filters; results carry the citation coordinates a lesson needs (source, page or timestamp).',
    parameters: {
      query: { type: 'string', required: true, description: 'Retrieve with this question, ideally the student\'s own wording.' },
      topK: { type: 'number', description: 'How many chunks to return (default 8).' },
      gapConcepts: { type: 'array', items: { type: 'string' }, description: 'Concept ids the student is weak on; matching chunks rank higher.' },
      sourceIds: { type: 'array', items: { type: 'string' } },
      kinds: { type: 'array', items: { type: 'string' }, description: 'para | formula | table | slide | page | transcript | code' },
      mmr: { type: 'boolean', description: 'Diversify near-duplicate hits (default true).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          query: { type: 'string' },
          embedder: { type: 'string' },
          results: { type: 'array', items: { type: 'object', additionalProperties: true, properties: {} } },
          message: { type: 'string' },
        },
      },
      render: (args, value) => renderSearch(value),
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const result = await searchIndex(ctx, ctx.sessionId, {
        query: String(args.query || ''),
        topK: Number(args.topK || 8),
        gapConcepts: args.gapConcepts || [],
        filters: { sourceIds: args.sourceIds, kinds: args.kinds },
        mmr: args.mmr !== false,
      })
      if (!result.ok) return result
      return { ...result, message: summarizeSearch(result) }
    },
  })

  tools.push({
    name: 'study_state',
    description: 'Read the current study state back. Use this after a long conversation, after compaction, or before writing a lesson, instead of regenerating what already exists. Pass a section to read only part of it.',
    parameters: {
      section: { type: 'string', description: 'all (default) | materials | boundary | graph | lessons | sources | index' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          section: { type: 'string' },
          snapshot: { type: 'string', description: 'JSON text of the requested state.' },
          summary: { type: 'string' },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.snapshot }],
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const state = stateOf(exec)
      const section = String(args.section || 'all')
      const coverage = boundaryCoverage(state)
      const stats = graphStats(state)
      const picked = section === 'all' ? state : pickSection(state, section)
      const summary = `Materials ${state.materials.length}, boundary ${coverage.confirmed}/${coverage.total}, graph ${stats.total} (gap ${stats.gap}), lessons ${state.lessons.length}, sources ${state.sources.length}${state.index ? `, index ${state.index.chunks || '?'} chunks` : ''}.`
      return {
        ok: true,
        section,
        summary,
        snapshot: JSON.stringify(picked, null, 1).slice(0, 120_000),
      }
    },
  })

  tools.push({
    name: 'study_export',
    description: 'Export the study notes as Markdown, one self-contained HTML file (offline formula and animation playback, inline graph) and the raw JSON state.',
    parameters: {
      formats: { type: 'array', items: { type: 'string' }, description: 'md | html | json (default all three).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean', required: true },
          directory: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          message: { type: 'string' },
        },
      },
      render: (args, value) => [{ type: 'text', text: value.message }],
    },
    async execute(args, exec) {
      const ctx = contextFor(context, exec)
      const state = stateOf(exec)
      const prepared = await prepareExport(ctx, state, ctx.sessionId)
      const result = writeExports(ctx.config, prepared.state, {
        sessionId: ctx.sessionId,
        formulaImages: prepared.formulaImages,
        frameImages: prepared.frameImages,
        chunks: prepared.chunks,
      })
      return {
        ok: true,
        directory: result.directory,
        files: result.files,
        message: `Exported ${result.files.length} file(s) to ${result.directory}`,
      }
    },
  })

  return tools
}

async function attachImages(context, paths, exec) {
  const blocks = []
  for (const path of paths || []) {
    const block = await attachImage(context, path, exec)
    if (block) blocks.push(block)
  }
  return blocks
}

async function attachImage(context, path, exec) {
  const attachments = context.attachments
  if (!attachments || !existsSync(path)) return null
  try {
    const data = readFileSync(path)
    const ref = await attachments.saveImage({ data: new Uint8Array(data), mediaType: mediaTypeOf(path), name: path.split(/[\\/]/).pop() })
    return { type: 'image', attachment: ref }
  } catch {
    return null
  }
}

function mediaTypeOf(path) {
  const lower = path.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

function renderIngest(value) {
  const blocks = []
  if (!value.ok) {
    blocks.push({ type: 'text', text: `Ingest failed: ${value.code} — ${value.message}` })
    if (value.attachments && value.attachments.length > 0) {
      blocks.push({ type: 'text', text: `Ingestible attachments: ${value.attachments.map((item) => `${item.name} (${item.bytes} B)`).join(', ')}` })
    }
    return blocks
  }
  const images = Array.isArray(value._images) ? value._images : []
  blocks.push(...images)
  const lines = []
  lines.push(`Read "${value.title}" (${value.kind}, via ${value.origin}).`)
  if (value.characters) lines.push(`Characters: ${value.characters}`)
  if (value.pageCount) lines.push(`Pages: ${value.pageCount}`)
  if (value.duration) lines.push(`Duration: ${Math.round(value.duration)}s`)
  if (value.segmentCount) lines.push(`Transcript segments: ${value.segmentCount}`)
  lines.push(`Chunks cached for the knowledge base: ${value.chunkCount || 0}`)
  if (value.continueFrom) lines.push(`Next range starts at ${value.continueFrom}s (pass startSec to continue).`)
  if (value.transcriptPreview) {
    lines.push('', 'Transcript head:', value.transcriptPreview)
  }
  if (value.shots && value.shots.length > 0) {
    lines.push('', 'Shots:', value.shots.slice(0, 12).map((shot) => `${shot.startSec}-${shot.endSec}s${shot.caption ? ` ${shot.caption.slice(0, 40)}` : ''}`).join(' | '))
  }
  if (value.formulas && value.formulas.length > 0) {
    lines.push('', 'Formulas found:', value.formulas.slice(0, 8).map((formula) => `\`${formula.latex}\` → ${formula.read || ''}`).join(' ; '))
  }
  if (value.blocks && value.blocks.length > 0) {
    lines.push('', 'Blocks:')
    for (const block of value.blocks.slice(0, 14)) {
      if (block.kind === 'formula') lines.push(`- 公式 ${block.latex} → ${block.read || ''}`)
      else if (block.kind === 'table') lines.push(`- 表格（${(block.rows || []).length} 行）`)
      else lines.push(`- ${block.kind}: ${String(block.text || '').slice(0, 180)}`)
    }
  }
  if (value.notices && value.notices.length > 0) {
    lines.push('', 'Notes:', ...value.notices.map((notice) => `- ${notice}`))
  }
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}

function renderResearch(value) {
  const lines = [value.message || '']
  for (const source of (value.sources || []).slice(0, 10)) {
    lines.push(`- [${source.kind || 'other'}${source.trust !== undefined ? ` · ${source.trust}/3` : ''}] ${source.title}${source.url ? ` <${source.url}>` : ''}`)
    if (source.notes) lines.push(`  ${String(source.notes).slice(0, 160)}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

function renderLesson(value) {
  const blocks = [{ type: 'text', text: value.message }]
  for (const item of (value._formulas || []).slice(0, 6)) {
    blocks.push({ type: 'text', text: `公式 \`${item.latex}\`\n读法：${item.read}` })
  }
  return blocks
}

function renderFormulaResult(value) {
  const blocks = []
  for (const image of value._images || []) blocks.push(image)
  const lines = []
  for (const item of value.items || []) {
    lines.push(`\\\\(${item.latex}\\\\)`)
    lines.push(`读法：${item.read}`)
    if (item.mathml) lines.push(`MathML: ${String(item.mathml).slice(0, 160)}…`)
    lines.push('')
  }
  if (!value.rasterised) lines.push('Formula images need pandoc plus the bundled LibreOffice kit; the plain readings are still exact.')
  blocks.push({ type: 'text', text: lines.join('\n') })
  return blocks
}

function renderSearch(value) {
  const lines = [value.message || '']
  for (const hit of (value.results || []).slice(0, 10)) {
    const where = `${hit.sourceTitle || hit.sourceId}${hit.meta?.page ? ` p.${hit.meta.page}` : ''}${hit.tsStart != null ? ` @${Math.round(hit.tsStart)}s` : ''}`
    lines.push(`- (${hit.score}) ${where}: ${String(hit.text).slice(0, 220)}`)
  }
  return [{ type: 'text', text: lines.join('\n') }]
}

function summarizeSearch(result) {
  const hits = result.results || []
  if (hits.length === 0) return `No chunk matched "${result.query}".`
  return `"${result.query}" → ${hits.length} chunk(s) via ${result.embedder}${result.dense ? ' (dense+lexical)' : ' (lexical only)'}.`
}

function collectLessonFormulas(lessons) {
  const found = []
  for (const lesson of lessons) {
    for (const section of lesson?.sections || []) {
      const blocks = Array.isArray(section.blocks) ? section.blocks : []
      for (const block of blocks) {
        if (block && block.kind === 'formula' && block.latex) found.push(block.latex)
      }
      if (typeof section.body === 'string') {
        for (const match of section.body.matchAll(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g)) {
          const latex = (match[1] || match[2] || '').trim()
          if (latex) found.push(latex)
        }
      }
    }
  }
  return [...new Set(found)]
}

/**
 * Read every cached chunks.json this session produced.
 * @param {object} context plugin context
 * @param {object} state folded state
 */
export function collectCachedChunks(context, state) {
  const chunks = []
  const seen = new Set()
  for (const material of state.materials || []) {
    if (!material || !material.artifactId) continue
    const path = join(dataPath(context.config, 'media', material.artifactId), 'chunks.json')
    if (!existsSync(path) || seen.has(path)) continue
    seen.add(path)
    try {
      const parsed = JSON.parse(readText(path))
      if (Array.isArray(parsed)) chunks.push(...parsed)
    } catch {
      continue
    }
  }
  return chunks
}

/** Collect rendered formula images and frame images for an export. */
export async function prepareExport(context, state, sessionId) {
  const formulaImages = new Map()
  const frameImages = new Map()
  const allLatex = []
  for (const lesson of state.lessons || []) {
    for (const section of lesson?.sections || []) {
      const blocks = Array.isArray(section.blocks) ? section.blocks : []
      for (const block of blocks) {
        if (block && block.kind === 'formula' && block.latex) allLatex.push(block.latex)
      }
    }
  }
  for (const formula of state.formulas || []) {
    if (formula.latex) allLatex.push(formula.latex)
  }
  const unique = [...new Set(allLatex)]
  if (unique.length > 0) {
    const rendered = await renderFormulas(context.engines, context.config, unique.map((latex, index) => ({ id: `export-${index}`, latex })))
    for (const item of rendered.items) {
      if (!item.imagePath) continue
      try {
        formulaImages.set(item.latex, `data:image/png;base64,${readFileSync(item.imagePath).toString('base64')}`)
      } catch {
        continue
      }
    }
  }
  const enriched = JSON.parse(JSON.stringify(state))
  for (const lesson of enriched.lessons || []) {
    for (const section of lesson?.sections || []) {
      if (!Array.isArray(section.blocks)) continue
      for (const block of section.blocks) {
        if (block && block.kind === 'formula' && block.latex) {
          const converted = await toMathml(context.engines.pluginRoot, block.latex)
          if (converted?.mathml) block.mathml = converted.mathml
          if (!block.read) block.read = converted?.read || ''
        }
      }
    }
  }
  const chunks = collectCachedChunks(context, state).map((chunk) => ({
    sourceTitle: chunk.sourceTitle,
    ordinal: chunk.ordinal,
    text: String(chunk.text || '').slice(0, 400),
  }))
  return { state: enriched, formulaImages, frameImages, chunks }
}

/** Count a graph's cycles for the state view. */
export function detectCycles(graph) {
  const nodes = (graph?.nodes || []).map((node) => node.id)
  const edges = graph?.edges || []
  const adjacency = new Map(nodes.map((id) => [id, []]))
  for (const edge of edges) {
    if (!adjacency.has(edge.from) || !adjacency.has(edge.to)) continue
    adjacency.get(edge.from).push(edge.to)
  }
  const state = new Map()
  const cycles = []
  const visit = (id, stack) => {
    if (state.get(id) === 'done') return
    if (state.get(id) === 'open') {
      cycles.push(stack.slice(stack.indexOf(id)).join('→'))
      return
    }
    state.set(id, 'open')
    for (const next of adjacency.get(id) || []) visit(next, [...stack, next])
    state.set(id, 'done')
  }
  for (const id of nodes) visit(id, [id])
  return cycles
}

function pickSection(state, section) {
  switch (section) {
    case 'materials': return { materials: state.materials, teachingPatterns: state.teachingPatterns }
    case 'boundary': return { boundary: state.boundary, boundaryLocked: state.boundaryLocked }
    case 'graph': return { graph: state.graph }
    case 'lessons': return { lessons: state.lessons }
    case 'sources': return { sources: state.sources, research: state.research }
    case 'index': return { index: state.index }
    default: return state
  }
}

export { TOOL_NAMES }


