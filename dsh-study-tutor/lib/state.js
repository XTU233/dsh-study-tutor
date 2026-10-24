/**
 * Session-derived study state.
 *
 * The session log is the only source of truth: every section of `StudyState`
 * is rebuilt by folding the argument of one `study_*` tool call, plus the
 * compact patch each tool appends to its own result. Nothing here is cached
 * outside the log, so fork, resume and replay all produce the same state.
 */

/** Every tool that writes study state. */
export const STUDY_TOOLS = [
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

/** Prefix of the invisible patch a tool appends to its result text. */
export const PATCH_PREFIX = '<!--study-patch:'
export const PATCH_SUFFIX = ':study-patch-->'

const MAX_WARNINGS = 40

/** A new, empty study state. */
export function emptyState() {
  return {
    version: 1,
    materials: [],
    teachingPatterns: [],
    boundary: [],
    boundaryLocked: false,
    graph: { nodes: [], edges: [], focus: [] },
    sources: [],
    lessons: [],
    formulas: [],
    index: null,
    research: [],
    warnings: [],
    revisions: { materials: 0, boundary: 0, graph: 0, lessons: 0, sources: 0, index: 0 },
    updatedAt: 0,
  }
}

function bump(state, key) {
  state.revisions[key] = (state.revisions[key] || 0) + 1
}

function mergeById(list, incoming, mode) {
  if (!Array.isArray(incoming) || incoming.length === 0) return list
  if (mode === 'replace') return incoming.filter(Boolean).map(clone)
  const next = list.map(clone)
  for (const item of incoming) {
    if (!item || !item.id) continue
    const index = next.findIndex((existing) => existing.id === item.id)
    if (index >= 0) next[index] = { ...next[index], ...clone(item) }
    else next.push(clone(item))
  }
  return next
}

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value))
}

function warn(state, message) {
  if (!message) return
  state.warnings.push({ at: state.updatedAt || 0, message: String(message).slice(0, 400) })
  if (state.warnings.length > MAX_WARNINGS) state.warnings.splice(0, state.warnings.length - MAX_WARNINGS)
}

/**
 * Fold one `study_*` call argument into the state.
 * @param {object} state mutable state
 * @param {string} name tool name
 * @param {object} args parsed call arguments
 */
export function applyCall(state, name, args) {
  if (!args || typeof args !== 'object') return
  const mode = args.mode === 'replace' ? 'replace' : 'append'
  switch (name) {
    case 'study_material': {
      if (Array.isArray(args.materials)) {
        state.materials = mergeById(state.materials, args.materials, mode)
        bump(state, 'materials')
      }
      if (Array.isArray(args.teachingPatterns)) {
        state.teachingPatterns = mergeById(
          state.teachingPatterns,
          args.teachingPatterns.map((item, index) => ({ id: item.id || `pattern-${index + 1}`, ...item })),
          mode,
        )
      }
      break
    }
    case 'study_boundary': {
      if (Array.isArray(args.concepts) && args.concepts.length > 0) {
        const incoming = args.concepts.map((item, index) => ({
          id: item.id || item.label || `concept-${index + 1}`,
          ...item,
        }))
        // Count the distinct interview rounds that touched each concept. A
        // concept recorded once at level 0 is a finding, not a conclusion, so
        // this counter is what later allows (or blocks) the lock.
        const previous = new Map((state.boundary || []).map((c) => [c.id, c]))
        for (const item of incoming) {
          const prior = previous.get(item.id)
          item.probedRounds = (prior?.probedRounds || 0) + 1
          item.firstLevel = prior ? (prior.firstLevel ?? prior.level) : item.level
        }
        state.boundary = mergeById(state.boundary || [], incoming, mode)
        state.interviewRounds = (state.interviewRounds || 0) + 1
        bump(state, 'boundary')
      }
      // Whether `lock` takes effect is decided by the tool, which can refuse and
      // explain. Never lock implicitly from the state fold alone.
      break
    }
    case 'study_graph': {
      const graph = state.graph || { nodes: [], edges: [], focus: [] }
      if (Array.isArray(args.nodes)) graph.nodes = mergeById(graph.nodes, args.nodes, mode)
      if (Array.isArray(args.edges) && args.edges.length) {
        const edges = mode === 'replace' ? [] : graph.edges.slice()
        const seen = new Set(edges.map((edge) => `${edge.from}->${edge.to}`))
        for (const edge of args.edges) {
          if (!edge || !edge.from || !edge.to) continue
          const key = `${edge.from}->${edge.to}`
          if (seen.has(key)) continue
          seen.add(key)
          edges.push({ from: edge.from, to: edge.to })
        }
        graph.edges = edges
      }
      if (Array.isArray(args.focus) && args.focus.length) graph.focus = args.focus.slice()
      state.graph = graph
      if (Array.isArray(args.nodes) || Array.isArray(args.edges)) bump(state, 'graph')
      break
    }
    case 'study_lesson': {
      if (Array.isArray(args.lessons)) {
        state.lessons = mergeById(state.lessons, args.lessons, mode)
        bump(state, 'lessons')
      }
      break
    }
    case 'study_formula': {
      if (Array.isArray(args.items)) {
        state.formulas = mergeById(
          state.formulas,
          args.items.map((item, index) => ({ id: item.id || `formula-${index + 1}`, ...item })),
          'append',
        )
      }
      break
    }
    default:
      break
  }
}

/**
 * Apply a patch emitted by a tool result.
 * @param {object} state mutable state
 * @param {object} patch patch payload
 */
export function applyPatch(state, patch) {
  if (!patch || typeof patch !== 'object') return
  if (patch.material) {
    state.materials = mergeById(state.materials, [patch.material], 'append')
    bump(state, 'materials')
  }
  if (Array.isArray(patch.materials)) {
    state.materials = mergeById(state.materials, patch.materials, patch.mode === 'replace' ? 'replace' : 'append')
    bump(state, 'materials')
  }
  if (Array.isArray(patch.sources)) {
    state.sources = mergeById(state.sources, patch.sources, 'append')
    bump(state, 'sources')
  }
  if (Array.isArray(patch.research)) {
    state.research = mergeById(
      state.research,
      patch.research.map((item, index) => ({ id: item.id || `query-${state.research.length + index + 1}`, ...item })),
      'append',
    )
  }
  if (patch.index) {
    state.index = patch.index
    bump(state, 'index')
  }
  if (patch.lessonIds && Array.isArray(patch.lessonIds)) {
    state.lessonOrder = patch.lessonIds.slice()
  }
  if (patch.warning) warn(state, patch.warning)
  // `locked` is only ever set by study_boundary after its own gates pass; the
  // fold applies it verbatim so a refused lock leaves the state untouched.
  if (patch.locked === true) state.boundaryLocked = true
  if (patch.locked === false) state.boundaryLocked = false
  if (typeof patch.interviewRounds === 'number') state.interviewRounds = patch.interviewRounds
}

/** Extract the trailing patch marker from one rendered tool result text. */
export function readPatch(text) {
  if (typeof text !== 'string') return null
  const start = text.lastIndexOf(PATCH_PREFIX)
  if (start < 0) return null
  const end = text.indexOf(PATCH_SUFFIX, start + PATCH_PREFIX.length)
  if (end < 0) return null
  const raw = text.slice(start + PATCH_PREFIX.length, end)
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function textOfContent(content) {
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const block of content) {
    if (block && block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Fold the whole event list into a study state.
 * @param {ReadonlyArray<object>} events session events in seq order
 * @param {{seq:number,state:object,calls:Map<string,string>}} [previous] cached fold
 * @returns {{seq:number,state:object,calls:Map<string,string>}}
 */
export function foldEvents(events, previous) {
  const cached = previous && previous.state ? previous : null
  const state = cached ? clone(cached.state) : emptyState()
  const calls = cached ? new Map(cached.calls) : new Map()
  let seq = cached ? cached.seq : -1
  const startIndex = (() => {
    if (!cached) return 0
    let low = 0
    let high = events.length
    while (low < high) {
      const middle = (low + high) >> 1
      if ((events[middle]?.seq ?? -1) > cached.seq) high = middle
      else low = middle + 1
    }
    return low
  })()

  for (let index = startIndex; index < events.length; index += 1) {
    const event = events[index]
    if (!event || typeof event.seq !== 'number') continue
    if (event.seq <= seq) continue
    if (event.type === 'tool/call') {
      const name = event.data?.name
      if (STUDY_TOOLS.includes(name)) {
        calls.set(event.data.callId, name)
        try {
          const args = JSON.parse(event.data.arguments || '{}')
          applyCall(state, name, args)
        } catch (error) {
          warn(state, `${name}: malformed arguments (${String(error).slice(0, 120)})`)
        }
      }
    } else if (event.type === 'tool/result') {
      const content = event.data?.message?.content
      const patch = readPatch(textOfContent(content))
      if (patch) applyPatch(state, patch)
    }
    seq = event.seq
  }

  state.updatedAt = events.length > 0 ? (events[events.length - 1]?.time || 0) : 0
  return { seq, state, calls }
}

/** Concept ids that are not yet confirmed, most uncertain first. */
export function openConcepts(state) {
  return (state.boundary || [])
    .filter((concept) => typeof concept.level !== 'number' || concept.level < 2)
    .sort((left, right) => (left.level ?? -1) - (right.level ?? -1))
}

/** Coverage of the knowledge-boundary interview. */
export function boundaryCoverage(state) {
  const concepts = state.boundary || []
  if (concepts.length === 0) return { total: 0, confirmed: 0, ratio: 0, unknown: 0 }
  const confirmed = concepts.filter((concept) => typeof concept.level === 'number' && concept.level >= 2).length
  const unknown = concepts.filter((concept) => concept.level === undefined || concept.level === null).length
  return { total: concepts.length, confirmed, ratio: confirmed / concepts.length, unknown }
}

// ── Multi-round boundary interview ─────────────────────────────────────────
// A one-shot interview is not enough: a concept recorded at level 0 or 1 is a
// finding, not a conclusion — the agent must go one level deeper and ask about
// that concept's prerequisites, then review whether anything is still unknown.
// These rules make that review mandatory instead of advisory.

/** A concept needs a deeper follow-up when it is below "applies with hints". */
export const NEEDS_FOLLOWUP_BELOW = 2
/** Minimum distinct interview rounds before the boundary may be locked. */
export const MIN_INTERVIEW_ROUNDS = 3
/** A lock is refused when this share of concepts is still unconfirmed. */
export const MIN_CONFIRMED_RATIO = 0.6

/** How many concepts were probed at each level. */
export function boundaryBreakdown(state) {
  const counts = { unknown: 0, heard: 0, hints: 0, independent: 0 }
  for (const concept of state.boundary || []) {
    const level = concept.level
    if (typeof level !== 'number') counts.unknown += 1
    else if (level <= 0) counts.heard += 1
    else if (level === 1) counts.hints += 1
    else if (level === 2) counts.independent += 1 // "applies with hints"
    else counts.independent += 1
  }
  return counts
}

/**
 * Concepts that still deserve a question, grouped by why.
 * @returns {{belowFloor: object[], unprobed: object[], prerequisites: object[]}}
 */
export function followupConcepts(state) {
  const boundary = state.boundary || []
  const graphNodes = state.graph?.nodes || []
  // A concept deliberately marked `gap: true` has been probed to the bottom and
  // recorded as "must be taught" — it needs no more questions. Without this
  // escape hatch a student who honestly knows none of the material could never
  // satisfy the coverage floor, and the interview would never end.
  const belowFloor = boundary.filter(
    (c) => c.gap !== true && typeof c.level === 'number' && c.level < NEEDS_FOLLOWUP_BELOW,
  )
  const unprobed = boundary.filter((c) => typeof c.level !== 'number' || c.level === null)
  // Graph gaps whose concept was never asked about.
  const probed = new Set(boundary.map((c) => c.id))
  const prerequisites = graphNodes.filter((n) => !probed.has(n.id))
  return { belowFloor, unprobed, prerequisites }
}

/** Concepts resolved as teaching gaps instead of open questions. */
export function declaredGaps(state) {
  return (state.boundary || []).filter((c) => c.gap === true)
}

/**
 * Whether the boundary may be locked right now.
 * @returns {{ok:boolean, reasons:string[]}}
 */
export function canLockBoundary(state) {
  const reasons = []
  const rounds = state.interviewRounds || 0
  const coverage = boundaryCoverage(state)
  const followups = followupConcepts(state)
  const gaps = declaredGaps(state)

  if (rounds < MIN_INTERVIEW_ROUNDS) {
    reasons.push(
      `only ${rounds} interview round(s) recorded; at least ${MIN_INTERVIEW_ROUNDS} are required so that low-level concepts can be probed further`,
    )
  }
  if (coverage.total === 0) {
    reasons.push('no concepts have been probed yet')
  } else if (coverage.ratio < MIN_CONFIRMED_RATIO) {
    // A concept that was asked about at least twice AND explicitly marked
    // `gap: true` counts as resolved: the interview extracted its real level, it
    // just happens to be "must be taught". Without this a genuine beginner — the
    // exact student this tool is for — could never finish the interview.
    const resolvedGaps = gaps.length
    const effectiveRatio = (coverage.confirmed + resolvedGaps) / coverage.total
    if (effectiveRatio < MIN_CONFIRMED_RATIO) {
      reasons.push(
        `only ${Math.round(coverage.ratio * 100)}% of probed concepts reached level >= ${NEEDS_FOLLOWUP_BELOW} (${resolvedGaps} more are recorded as declared teaching gaps, giving ${Math.round(effectiveRatio * 100)}%); ` +
        `at least ${Math.round(MIN_CONFIRMED_RATIO * 100)}% is required. Probe the lows once more, then mark the ones you will simply teach as gap: true.`,
      )
    }
  }
  if (followups.unprobed.length > 0 && rounds > 0) {
    const names = followups.unprobed.slice(0, 6).map((c) => c.label || c.id)
    reasons.push(`${followups.unprobed.length} concept(s) have no level yet: ${names.join('、')}`)
  }
  if (rounds >= MIN_INTERVIEW_ROUNDS && followups.belowFloor.length > 0) {
    // Below-floor concepts are allowed (that is the point of studying), but only
    // once the agent has explicitly registered a deeper question for them.
    const asked = new Set((state.boundary || []).filter((c) => c.probedRounds > 1).map((c) => c.id))
    const unasked = followups.belowFloor.filter((c) => !asked.has(c.id))
    if (unasked.length > 0) {
      const names = unasked.slice(0, 6).map((c) => c.label || c.id)
      reasons.push(
        `${unasked.length} below-level-${NEEDS_FOLLOWUP_BELOW} concept(s) have only been asked once — ask a follow-up (or a question about their prerequisites) first: ${names.join('、')}`,
      )
    }
  }
  return { ok: reasons.length === 0, reasons }
}

/** Graph nodes split by status. */
export function graphStats(state) {
  const nodes = state.graph?.nodes || []
  const stats = { ready: 0, partial: 0, gap: 0, total: nodes.length }
  for (const node of nodes) {
    if (node.status === 'ready') stats.ready += 1
    else if (node.status === 'partial') stats.partial += 1
    else stats.gap += 1
  }
  return stats
}
