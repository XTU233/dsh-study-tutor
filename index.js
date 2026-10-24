/**
 * Host half of the study tutor.
 *
 * Responsibilities: fold the session log into a study state, register the
 * agent tools, expose the same state and export action over an HTTP route for
 * the browser half, and register the teaching protocol as a skill.
 */

import { join } from 'node:path'
import { dshHome, pluginRoot } from './lib/paths.js'
import { resolveEngines } from './lib/engines.js'
import { boundaryCoverage, foldEvents, graphStats } from './lib/state.js'
import { createTools, prepareExport } from './lib/tools.js'
import { registerRoutes } from './lib/routes.js'
import { searchIndex, indexStatus } from './lib/kb.js'
import { speechSnapshot } from './lib/speech.js'
import { writeExports } from './lib/export.js'
import { skillRegistration } from './lib/skill.js'

export const name = 'study-tutor'

export const inject = ['tools']

const DEFAULTS = {
  dataDir: '',
  ffmpegDir: '',
  pandocPath: '',
  pythonPath: '',
  libreofficeCli: '',
  modelDir: '',
  autoInstallTools: false,
  asrProvider: 'sensevoice-local',
  asrLanguage: 'zh',
  asrPrepareTimeoutMs: 1200000,
  audioChunkSeconds: 60,
  sceneThreshold: 0.35,
  maxShots: 40,
  maxFramesPerCall: 6,
  maxVideoSeconds: 7200,
  maxFileBytes: 512 * 1024 * 1024,
  maxNodes: 240,
  researchMaxSources: 5,
  allowedRoots: [],
  promptSectionFallback: true,
}

/** Merge the entry config over the plugin defaults. */
export function resolveConfig(raw) {
  const config = { ...DEFAULTS }
  if (raw && typeof raw === 'object') {
    for (const key of Object.keys(DEFAULTS)) {
      if (raw[key] !== undefined && raw[key] !== null) config[key] = raw[key]
    }
  }
  return config
}

/** Read a session's events from the live agent or from persistence. */
export async function sessionEvents(ctx, sessionId) {
  const live = ctx.get?.('agents')?.get?.(sessionId)
  if (live && live.session && typeof live.session.snapshotEvents === 'function') {
    try {
      return { ok: true, events: live.session.snapshotEvents() }
    } catch {
      /* fall through to the controller */
    }
  }
  const controller = ctx.get?.('sessionController')
  if (!controller || typeof controller.inspect !== 'function') {
    return { ok: false, status: 404, code: 'SESSION_UNAVAILABLE', message: 'The session controller is not mounted.' }
  }
  try {
    const inspection = await controller.inspect(sessionId)
    if (!inspection || !Array.isArray(inspection.events)) {
      return { ok: false, status: 404, code: 'SESSION_NOT_FOUND', message: `Session ${sessionId} was not found.` }
    }
    return { ok: true, events: inspection.events }
  } catch (error) {
    return {
      ok: false,
      status: 404,
      code: 'SESSION_READ_FAILED',
      message: String(error && error.message ? error.message : error),
    }
  }
}

/**
 * Build the read-only view of one session's study state.
 * @param {object} ctx cordis context
 * @param {string} sessionId session to read
 * @param {object} config plugin config
 * @param {{engines?:object}} [options]
 */
export async function readStudyState(ctx, sessionId, config, options = {}) {
  const events = await sessionEvents(ctx, sessionId)
  if (!events.ok) return events
  const folded = foldEvents(events.events)
  const state = folded.state
  const coverage = boundaryCoverage(state)
  const stats = graphStats(state)
  let index = state.index
  if (!index && options.engines) {
    try {
      const status = await indexStatus({ engines: options.engines, config, sessionId }, sessionId)
      if (status && status.exists) index = status
    } catch {
      index = null
    }
  }
  return {
    ok: true,
    sessionId,
    asOfSeq: folded.seq,
    state: { ...state, coverage, graphStats: stats, index },
    eventCount: events.events.length,
  }
}

/**
 * Normalise a declared schema into the model-facing JSON Schema.
 *
 * The plugin's DSL marks a required property with `required: true` on the
 * CHILD spec. JSON Schema instead puts a `required: string[]` array on the
 * PARENT object. Both output schemas and the nested `items`/`properties` of
 * parameter schemas use the DSL form, so this walks the whole tree and hoists
 * every boolean into its parent's array, at any depth.
 * @param {object} schema declared schema or subtree
 * @returns {object} the same tree with object-level `required` arrays
 */
export function sanitizeOutputSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema
  const clone = JSON.parse(JSON.stringify(schema))

  const walk = (node) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return
    // Depth first: normalise nested property maps before collecting this level.
    if (Array.isArray(node.items)) for (const item of node.items) walk(item)
    else if (node.items) walk(node.items)
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      if (Array.isArray(node[key])) for (const branch of node[key]) walk(branch)
    }
    if (node.properties && typeof node.properties === 'object') {
      const required = []
      for (const [name, child] of Object.entries(node.properties)) {
        if (!child || typeof child !== 'object' || Array.isArray(child)) continue
        if (child.required === true) required.push(name)
        if (typeof child.required === 'boolean') delete child.required
        walk(child)
      }
      if (required.length > 0 && !Array.isArray(node.required)) node.required = required
    }
  }

  walk(clone)
  return clone
}

/**
 * Convert the plugin's parameter DSL into the JSON Schema sent to the model.
 *
 * `tools.register()` performs NO conversion: it stores `parameters` verbatim
 * and that value is exactly what the model receives. The registry's
 * `defineTool()` helper does the conversion, but a plain `register()` call —
 * which this plugin uses to stay free of runtime package imports — must do it
 * itself. Passing the bare property map through ships a schema with no root
 * `type: "object"` and child-level `required` booleans; providers reject that
 * outright with an HTTP 400.
 *
 * The shape produced here matches DSH's own
 * `parameterSchemaSpecToJsonSchema()`: `{ type, properties, required? }`.
 * @param {object} parameters declared parameter map
 * @returns {object} an object-rooted JSON Schema
 */
export function parametersToJsonSchema(parameters) {
  if (!parameters || typeof parameters !== 'object') {
    return { type: 'object', properties: {} }
  }
  // Already a JSON Schema (it names a root type): normalise it in place.
  if (typeof parameters.type === 'string') return sanitizeOutputSchema(parameters)

  const properties = {}
  const required = []
  for (const [key, spec] of Object.entries(parameters)) {
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) continue
    const { required: isRequired, ...rest } = spec
    properties[key] = sanitizeOutputSchema(rest)
    if (isRequired === true) required.push(key)
  }
  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required }),
  }
}

/**
 * Strip values the Host's lossless-JSON validator rejects.
 *
 * The Host snapshots a tool's return value with `snapshotJsonValue()`, which
 * rejects `undefined` (it is neither a finite number, a string, a boolean nor
 * `null`), non-plain objects and `NaN`/`Infinity`. A tool that returns
 * `{ characters: undefined }` therefore fails the whole call with
 * `value is not lossless JSON` — even though the tool's real work succeeded
 * and was already written to disk.
 *
 * `undefined` is the common case: optional fields are produced with
 * `value: undefined` in an object literal, and a field that is absent is
 * indistinguishable from a field that is `undefined` once the object exists.
 * Dropping those keys keeps the meaning ("this optional field has no value")
 * while making the payload a valid JSON snapshot.
 *
 * @param {*} value any tool return value
 * @returns {*} a value the Host can snapshot
 */
export function toLosslessJson(value) {
  if (value === null) return null
  const type = typeof value
  if (type === 'string' || type === 'boolean') return value
  if (type === 'number') return Number.isFinite(value) ? value : null
  if (type === 'undefined' || type === 'function' || type === 'symbol') return undefined
  if (type !== 'object') return undefined
  if (Array.isArray(value)) {
    const items = []
    for (const item of value) {
      const clean = toLosslessJson(item)
      items.push(clean === undefined ? null : clean)
    }
    return items
  }
  // Anything that is not a plain object (Date, Map, class instance, Buffer)
  // is not a JSON snapshot; render it as its string form rather than failing.
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) {
    if (typeof value.toJSON === 'function') return toLosslessJson(value.toJSON())
    return String(value)
  }
  const out = {}
  for (const [key, item] of Object.entries(value)) {
    const clean = toLosslessJson(item)
    if (clean === undefined) continue
    out[key] = clean
  }
  return out
}

/** Convert one plain tool object into the registry's definition shape. */
function adaptTool(tool) {
  return {
    name: tool.name,
    description: tool.description,
    parameters: parametersToJsonSchema(tool.parameters),
    output: {
      schema: sanitizeOutputSchema(tool.output.schema),
      render: (args, value) => {
        const images = Array.isArray(value?._images) ? value._images : []
        const rendered = tool.output.render ? tool.output.render(args, value) : [{ type: 'text', text: 'done' }]
        const blocks = [...images, ...rendered]
        const patch = value && typeof value === 'object' ? value.patch || value._patch : undefined
        if (patch) {
          let json
          try {
            json = JSON.stringify(patch)
          } catch {
            json = undefined
          }
          if (json) {
            const marker = `\n\n<!--study-patch:${json}:study-patch-->`
            const lastText = [...blocks].reverse().find((block) => block && block.type === 'text')
            if (lastText) lastText.text = `${lastText.text}${marker}`
            else blocks.push({ type: 'text', text: marker })
          }
        }
        return blocks
      },
    },
    async execute(args, exec) {
      const value = await tool.execute(args, exec)
      const cleaned = toLosslessJson(value)
      if (cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned) && cleaned._chunks) {
        const { _chunks, ...rest } = cleaned
        return { ...rest, chunkCount: Array.isArray(_chunks) ? _chunks.length : rest.chunkCount }
      }
      return cleaned
    },
    isConcurrencySafe: () => false,
    ...(typeof tool.presentCall === 'function' ? { presentCall: tool.presentCall } : {}),
  }
}

/**
 * Plugin entry point.
 * @param {object} ctx cordis context
 * @param {object} rawConfig loader config
 */
export function apply(ctx, rawConfig) {
  const config = resolveConfig(rawConfig)
  const runtime = { engines: null }

  const enginesNow = () => runtime.engines || {
    available: {},
    versions: {},
    pluginRoot: pluginRoot(),
    pythonPath: join(pluginRoot(), 'tools', 'pylib'),
  }
  const enginesReady = resolveEngines(config).then((engines) => {
    runtime.engines = engines
    return engines
  })
  enginesReady.catch(() => {})

  // The base context is shared by every session in the profile; each tool call
  // derives a session-bound context from its own `exec` (see contextFor() in
  // lib/tools.js), because the knowledge base, exports and media cache are all
  // keyed by the calling session's id.
  const toolContext = {
    config,
    get engines() {
      return enginesNow()
    },
    get speech() {
      return ctx.get('speechToText')
    },
    get attachments() {
      return ctx.get('attachments')
    },
    get host() {
      return {
        get web() {
          return ctx.get('web')
        },
      }
    },
    sessionCwd: undefined,
  }

  // Tools are the primary capability: register them synchronously so the
  // schema set is stable before the first model step.
  for (const tool of createTools(toolContext)) {
    ctx.tools.register(adaptTool(tool))
  }

  // Routes are optional: a profile without a web server still gets the tools.
  ctx.inject(['webServer', 'sessionController'], (scope) => {
    scope.effect(() => registerRoutes(scope, {
      config,
      get engines() {
        return enginesNow()
      },
      readStudyState: async (sessionId) => {
        const engines = runtime.engines || (await enginesReady)
        return readStudyState(scope, sessionId, config, { engines })
      },
      search: async (sessionId, request) => {
        const engines = runtime.engines || (await enginesReady)
        return searchIndex({ engines, config, sessionId }, sessionId, {
          query: request.query,
          topK: request.topK,
          gapConcepts: request.gapConcepts,
          sourceIds: request.sourceIds,
        })
      },
      exportStudy: async (sessionId) => {
        const engines = runtime.engines || (await enginesReady)
        const folded = await readStudyState(scope, sessionId, config, { engines })
        if (!folded.ok) return folded
        const prepared = await prepareExport(
          { engines, config, attachments: scope.get('attachments') },
          folded.state,
          sessionId,
        )
        const written = writeExports(config, prepared.state, {
          sessionId,
          formulaImages: prepared.formulaImages,
          frameImages: prepared.frameImages,
          chunks: prepared.chunks,
        })
        return { ok: true, directory: written.directory, files: written.files }
      },
      speechSnapshot: () => speechSnapshot({ speechToText: scope.get('speechToText') }),
    }), 'study-tutor: routes')
  })

  // The teaching protocol: a runtime skill when available.
  ctx.inject(['skills'], (scope) => {
    scope.effect(() => {
      try {
        return scope.skills.register(skillRegistration())
      } catch (error) {
        ctx.logger?.warn?.(`study-tutor: skill registration failed (${error})`)
        return () => {}
      }
    }, 'study-tutor: skill')
  })

  // Fallback: when the profile has no skills service, keep the workflow in the
  // prompt so the model still follows the protocol.
  if (config.promptSectionFallback) {
    ctx.inject(['systemPrompt'], (scope) => {
      scope.effect(() => {
        if (scope.get('skills')) return () => {}
        return scope.systemPrompt.section({
          name: 'study-tutor',
          order: 900,
          text: [
            '教学插件「学习教练」已启用。学生提交学习资料时按此流程：',
            '1) study_ingest 读资料（视频/音频自动切片抽帧与转写）；2) study_research 查证权威来源；',
            '3) 多轮 ask_user_question 确认知识边界并用 study_boundary 落库；4) study_graph 建前置图谱；',
            '5) study_boundary(lock:true) 后 study_index 建向量知识库；6) study_search 检索片段；',
            '7) 按拓扑序 study_lesson 逐概念授课（每个跳步概念配动画，公式用 formula 块，禁止裸露 LaTeX）；',
            '8) 检查题后回写 boundary；9) study_export 导出。',
            '可用工具：study_ingest、study_research、study_material、study_boundary、study_graph、study_lesson、study_formula、study_index、study_search、study_state、study_export。',
          ].join('\n'),
        })
      }, 'study-tutor: prompt fallback')
    })
  }

  return () => {
    runtime.engines = null
  }
}

export { DEFAULTS }
