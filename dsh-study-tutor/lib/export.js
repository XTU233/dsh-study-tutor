/**
 * Study notes export. Three artefacts come out of one state:
 *
 *   study-notes.md    a durable note with formulas as images, LaTeX as an
 *                     appendix and every citation intact
 *   study.html        one self-contained file: inline CSS, inline SVG graph,
 *                     base64 formula images and key frames, a working frame
 *                     player and an offline search box
 *   study.json        the raw state, for reuse or re-import
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { exportDir, writeText } from './paths.js'
import { MATHML_CSS } from './mathml.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|')
}

function dataUri(path) {
  if (!path || !existsSync(path)) return null
  try {
    const data = readFileSync(path)
    const base64 = data.toString('base64')
    return `data:image/png;base64,${base64}`
  } catch {
    return null
  }
}

function clock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0))
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  const hours = Math.floor(minutes / 60)
  const pad = (value) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes % 60)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}

function nodeStatusLabel(status) {
  if (status === 'ready') return '已掌握'
  if (status === 'partial') return '半懂'
  return '缺失'
}

function levelLabel(level) {
  if (level === 3) return '能独立讲解'
  if (level === 2) return '能按提示应用'
  if (level === 1) return '听过/能复述'
  if (level === 0) return '没听过'
  return '未确认'
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/**
 * Render the Markdown note.
 * @param {object} state folded study state
 * @param {{formulaImages?:Map<string,string>, sessionId?:string, generatedAt?:number}} options
 */
export function renderMarkdown(state, options = {}) {
  const lines = []
  const images = options.formulaImages || new Map()
  lines.push('# 学习笔记')
  lines.push('')
  lines.push(`> 由 dsh-study-tutor 生成于 ${new Date(options.generatedAt || Date.now()).toLocaleString('zh-CN')}`)
  if (options.sessionId) lines.push(`> 会话：${options.sessionId}`)
  lines.push('')

  const materials = state.materials || []
  lines.push('## 资料清单')
  lines.push('')
  if (materials.length === 0) lines.push('（暂无资料）')
  for (const material of materials) {
    lines.push(`### ${material.title || material.id || '未命名资料'}`)
    lines.push('')
    const meta = []
    if (material.kind) meta.push(`类型：${material.kind}`)
    if (material.difficulty) meta.push(`难度：${material.difficulty}`)
    if (material.source) meta.push(`来源：${material.source}`)
    if (meta.length) lines.push(meta.join(' ｜ '))
    if (material.summary) lines.push('', material.summary)
    if (Array.isArray(material.keyTopics) && material.keyTopics.length) {
      lines.push('', `关键主题：${material.keyTopics.join('、')}`)
    }
    if (Array.isArray(material.gaps) && material.gaps.length) {
      lines.push('', '跳步/缺失：')
      for (const gap of material.gaps) lines.push(`- ${gap}`)
    }
    lines.push('')
  }

  const patterns = state.teachingPatterns || []
  if (patterns.length > 0) {
    lines.push('## 教学法提炼')
    lines.push('')
    for (const pattern of patterns) {
      lines.push(`- **${pattern.name || pattern.id}**：${pattern.description || ''}${pattern.evidence ? `（依据：${pattern.evidence}）` : ''}`)
    }
    lines.push('')
  }

  lines.push('## 知识边界')
  lines.push('')
  lines.push(`锁定状态：${state.boundaryLocked ? '已锁定' : '未锁定'}`)
  lines.push('')
  lines.push('| 概念 | 掌握度 | 置信度 | 证据 |')
  lines.push('| --- | --- | --- | --- |')
  for (const concept of state.boundary || []) {
    lines.push(`| ${escapeMarkdown(concept.label || concept.id)} | ${levelLabel(concept.level)} | ${concept.confidence ?? '-'} | ${escapeMarkdown(concept.evidence || '')} |`)
  }
  lines.push('')

  lines.push('## 前置知识图谱')
  lines.push('')
  const nodes = state.graph?.nodes || []
  const edges = state.graph?.edges || []
  if (nodes.length === 0) lines.push('（暂无图谱）')
  for (const node of nodes) {
    const prereqs = edges.filter((edge) => edge.to === node.id).map((edge) => nodeLabel(nodes, edge.from))
    lines.push(`- [${nodeStatusLabel(node.status)}] **${node.label || node.id}**${node.summary ? `：${node.summary}` : ''}`)
    if (prereqs.length) lines.push(`  - 前置：${prereqs.join('、')}`)
  }
  lines.push('')

  const sources = state.sources || []
  if (sources.length > 0) {
    lines.push('## 参考来源')
    lines.push('')
    for (const source of sources) {
      lines.push(`- [${source.kind || 'other'}] ${source.title || source.url || source.id}${source.url ? ` <${source.url}>` : ''}${source.trust !== undefined ? `（可信度 ${source.trust}/3）` : ''}`)
      if (source.notes) lines.push(`  - ${source.notes}`)
    }
    lines.push('')
  }

  lines.push('## 课程')
  lines.push('')
  for (const lesson of state.lessons || []) {
    lines.push(`### ${lesson.title || lesson.id}`)
    lines.push('')
    if (lesson.goal) lines.push(`**目标**：${lesson.goal}`, '')
    if (Array.isArray(lesson.prerequisites) && lesson.prerequisites.length) {
      lines.push(`**前置**：${lesson.prerequisites.join('、')}`, '')
    }
    if (Array.isArray(lesson.sources) && lesson.sources.length) {
      lines.push(`**依据来源**：${lesson.sources.join('、')}`, '')
    }
    for (const section of lesson.sections || []) {
      lines.push(`#### ${section.heading || ''}`)
      lines.push('')
      for (const block of blocksOf(section)) {
        if (block.kind === 'formula') {
          const uri = images.get(block.latex)
          lines.push(`![${escapeMarkdown(block.alt || block.read || 'formula')}](${uri ? writeFormulaFileHint(block, uri) : `formula:${block.latex}`})`)
          lines.push('')
          lines.push(`> 读法：${block.read || ''}`)
          lines.push('')
        } else if (block.kind === 'image') {
          lines.push(`![${escapeMarkdown(block.alt || '')}](${block.src || ''})`)
          lines.push('')
        } else if (block.kind === 'table') {
          const rows = block.rows || []
          if (rows.length) {
            lines.push(`| ${rows[0].map(escapeMarkdown).join(' | ')} |`)
            lines.push(`| ${rows[0].map(() => '---').join(' | ')} |`)
            for (const row of rows.slice(1)) lines.push(`| ${row.map(escapeMarkdown).join(' | ')} |`)
            lines.push('')
          }
        } else if (block.kind === 'list') {
          for (const item of block.items || block.text?.split('\n') || []) lines.push(`- ${item}`)
          lines.push('')
        } else if (block.kind === 'checkpoint') {
          lines.push(`**检查题**：${block.text || block.question || ''}`)
          if (block.answer) lines.push('', `<details><summary>查看答案</summary>`, '', block.answer, '', '</details>')
          lines.push('')
        } else if (block.kind === 'callout') {
          lines.push(`> ${block.text || ''}`)
          lines.push('')
        } else if (block.kind === 'code') {
          // Monospace diagrams (ASCII flow charts) must stay byte-exact.
          lines.push('```text')
          lines.push(String(block.text || '').replace(/\s+$/, ''))
          lines.push('```')
          lines.push('')
        } else {
          lines.push(block.text || '')
          lines.push('')
        }
      }
    }
    // The SVG frame player is disabled in the UI (frames rendered cramped and
    // unreadable), so exports no longer emit a 动画分镜 section either. Lesson
    // bodies carry ASCII diagrams in `code` blocks instead.
  }

  const formulas = state.formulas || []
  if (formulas.length > 0) {
    lines.push('## 公式附录（LaTeX）')
    lines.push('')
    for (const formula of formulas) {
      lines.push(`- \`${formula.latex || ''}\`${formula.read ? ` — ${formula.read}` : ''}`)
    }
    lines.push('')
  }

  if (Array.isArray(state.warnings) && state.warnings.length > 0) {
    lines.push('## 构建警告')
    lines.push('')
    for (const warning of state.warnings) lines.push(`- ${warning.message}`)
    lines.push('')
  }
  return lines.join('\n')
}

function writeFormulaFileHint(block, uri) {
  // Markdown readers accept a data URI; keep it short by referencing the file.
  return block.imagePath || uri.slice(0, 32) + '…'
}

function nodeLabel(nodes, id) {
  const found = nodes.find((node) => node.id === id)
  return found ? found.label || found.id : id
}

// ---------------------------------------------------------------------------
// Sections: blocks of the current lesson shape, with the legacy string form
// ---------------------------------------------------------------------------

/** Normalise one lesson section into blocks. */
export function blocksOf(section) {
  if (!section) return []
  if (Array.isArray(section.blocks) && section.blocks.length > 0) return section.blocks
  if (typeof section.body !== 'string' || !section.body.trim()) {
    if (section.kind === 'checkpoint') return [{ kind: 'checkpoint', text: section.question || '', answer: section.answer }]
    return []
  }
  // Legacy `body`: split around $...$ so formulas still become real blocks.
  const blocks = []
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g
  let cursor = 0
  let match
  while ((match = pattern.exec(section.body)) !== null) {
    const before = section.body.slice(cursor, match.index).trim()
    if (before) blocks.push({ kind: 'para', text: before })
    const latex = (match[1] || match[2] || '').trim()
    if (latex) blocks.push({ kind: 'formula', latex, read: '', display: Boolean(match[1]) })
    cursor = match.index + match[0].length
  }
  const rest = section.body.slice(cursor).trim()
  if (rest) blocks.push({ kind: 'para', text: rest })
  if (section.kind === 'checkpoint') blocks.push({ kind: 'checkpoint', text: section.question || '', answer: section.answer })
  return blocks
}

// ---------------------------------------------------------------------------
// Single-file HTML
// ---------------------------------------------------------------------------

const HTML_CSS = `
:root{color-scheme:light dark;--bg:#fbfaf7;--layer:#ffffff;--ink:#1d1d1f;--muted:#5b5b60;--line:#dedad2;--accent:#2f7fd0;--ok:#3f9a5a;--warn:#c98a12;--err:#c2483d}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--layer:#1e2024;--ink:#ecebe8;--muted:#a5a6ab;--line:#33363c;--accent:#66a8eb;--ok:#6ccb86;--warn:#e2b455;--err:#ef8479}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Segoe UI","Microsoft YaHei",system-ui,sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:26px;margin:0 0 6px}
h2{font-size:20px;margin:34px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--line)}
h3{font-size:17px;margin:22px 0 8px}
h4{font-size:15px;margin:16px 0 6px;color:var(--muted)}
.sub{color:var(--muted);font-size:13px;margin-bottom:24px}
.card{background:var(--layer);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:12px 0}
.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.tag{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:1px 9px;font-size:12px;color:var(--muted)}
.tag.ok{color:var(--ok);border-color:var(--ok)}
.tag.warn{color:var(--warn);border-color:var(--warn)}
.tag.err{color:var(--err);border-color:var(--err)}
table{border-collapse:collapse;width:100%;margin:12px 0;font-size:14px}
th,td{border:1px solid var(--line);padding:6px 9px;text-align:left;vertical-align:top}
th{background:var(--layer);font-weight:600}
blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid var(--accent);background:var(--layer);border-radius:0 8px 8px 0;color:var(--muted)}
code{background:var(--layer);border:1px solid var(--line);border-radius:5px;padding:1px 5px;font-size:13px}
.formula{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:10px 12px;background:var(--layer);border:1px solid var(--line);border-radius:10px;margin:10px 0}
.formula img{max-width:100%;height:auto;background:#fff;border-radius:6px;padding:4px}
.formula .read{color:var(--muted);font-size:13px}
details{border:1px dashed var(--line);border-radius:10px;padding:8px 12px;margin:10px 0}
summary{cursor:pointer;color:var(--accent)}
input[type=search]{width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:10px;background:var(--layer);color:var(--ink);font-size:14px}
.hit{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;background:var(--layer)}
.hit .meta{color:var(--muted);font-size:12px;margin-bottom:4px}
audio{width:100%;margin-top:8px}
` + MATHML_CSS

const DIAGRAM_CSS = `
/* Monospace ASCII diagrams. Exported lesson bodies draw flows with box
   characters and arrows; they only work with an exact monospace font and
   preserved whitespace, so they get their own block instead of the SVG stage. */
pre.diagram{background:var(--layer);border:1px solid var(--line);border-radius:10px;padding:14px 16px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"Liberation Mono",monospace;font-size:12.5px;line-height:1.45;white-space:pre;tab-size:2;color:var(--ink);margin:10px 0}
`

const SEARCH_JS = `
<script>
(function(){
  var chunks = JSON.parse(document.getElementById('kb-data').textContent || '[]');
  var input = document.getElementById('kb-query');
  var out = document.getElementById('kb-results');
  if (!input || !out) return;
  function norm(text){ return (text || '').toLowerCase(); }
  function run(){
    var query = norm(input.value.trim());
    out.innerHTML = '';
    if (!query) return;
    var rows = [];
    var words = query.split(/\\s+/).filter(Boolean);
    chunks.forEach(function(chunk){
      var text = norm(chunk.text);
      var score = 0;
      words.forEach(function(word){
        if (!word) return;
        var hits = text.split(word).length - 1;
        score += hits * (word.length > 1 ? 2 : 1);
      });
      if (score > 0) rows.push({ chunk: chunk, score: score });
    });
    rows.sort(function(a, b){ return b.score - a.score; });
    rows.slice(0, 12).forEach(function(row){
      var wrap = document.createElement('div');
      wrap.className = 'hit';
      var meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = (row.chunk.sourceTitle || '') + (row.chunk.ordinal ? ' · #' + row.chunk.ordinal : '');
      var body = document.createElement('div');
      body.textContent = row.chunk.text;
      wrap.appendChild(meta);
      wrap.appendChild(body);
      out.appendChild(wrap);
    });
    if (rows.length === 0) out.textContent = '没有命中。';
  }
  input.addEventListener('input', run);
})();
</script>
`

/**
 * Render the single-file HTML export.
 * @param {object} state folded state
 * @param {{formulaImages?:Map<string,string>, frames?:Map<string,string>, chunks?:ReadonlyArray<object>, sessionId?:string, generatedAt?:number, title?:string}} options
 */
export function renderHtml(state, options = {}) {
  const images = options.formulaImages || new Map()
  const frameImages = options.frames || new Map()
  const parts = []
  parts.push('<!doctype html>')
  parts.push('<html lang="zh-CN"><head><meta charset="utf-8">')
  parts.push('<meta name="viewport" content="width=device-width,initial-scale=1">')
  parts.push(`<title>${escapeHtml(options.title || '学习笔记')}</title>`)
  parts.push(`<style>${HTML_CSS}${DIAGRAM_CSS}</style>`)
  parts.push('</head><body><main>')
  parts.push(`<h1>${escapeHtml(options.title || '学习笔记')}</h1>`)
  parts.push(`<div class="sub">由 dsh-study-tutor 生成 · ${escapeHtml(new Date(options.generatedAt || Date.now()).toLocaleString('zh-CN'))}${options.sessionId ? ` · ${escapeHtml(options.sessionId)}` : ''}</div>`)

  parts.push('<h2>资料清单</h2>')
  for (const material of state.materials || []) {
    parts.push('<div class="card">')
    parts.push(`<h3>${escapeHtml(material.title || material.id)}</h3>`)
    const tags = []
    if (material.kind) tags.push(`<span class="tag">${escapeHtml(material.kind)}</span>`)
    if (material.difficulty) tags.push(`<span class="tag">${escapeHtml(material.difficulty)}</span>`)
    if (material.source) tags.push(`<span class="tag">${escapeHtml(material.source)}</span>`)
    if (tags.length) parts.push(`<div class="row">${tags.join('')}</div>`)
    if (material.summary) parts.push(`<p>${escapeHtml(material.summary)}</p>`)
    if (Array.isArray(material.keyTopics) && material.keyTopics.length) {
      parts.push(`<p>关键主题：${material.keyTopics.map((topic) => `<span class="tag">${escapeHtml(topic)}</span>`).join(' ')}</p>`)
    }
    if (Array.isArray(material.gaps) && material.gaps.length) {
      parts.push(`<p>跳步/缺失：</p><ul>${material.gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join('')}</ul>`)
    }
    parts.push('</div>')
  }

  parts.push('<h2>知识边界</h2>')
  parts.push('<table><thead><tr><th>概念</th><th>掌握度</th><th>置信度</th><th>证据</th></tr></thead><tbody>')
  for (const concept of state.boundary || []) {
    parts.push(`<tr><td>${escapeHtml(concept.label || concept.id)}</td><td>${escapeHtml(levelLabel(concept.level))}</td><td>${escapeHtml(concept.confidence ?? '-')}</td><td>${escapeHtml(concept.evidence || '')}</td></tr>`)
  }
  parts.push('</tbody></table>')

  parts.push('<h2>前置知识图谱</h2>')
  parts.push(renderGraphSvg(state))

  const sources = state.sources || []
  if (sources.length > 0) {
    parts.push('<h2>参考来源</h2><ul>')
    for (const source of sources) {
      const link = source.url ? ` <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.url)}</a>` : ''
      parts.push(`<li>[${escapeHtml(source.kind || 'other')}] ${escapeHtml(source.title || '')}${link}${source.trust !== undefined ? ` · 可信度 ${escapeHtml(source.trust)}/3` : ''}</li>`)
    }
    parts.push('</ul>')
  }

  parts.push('<h2>课程</h2>')
  for (const lesson of state.lessons || []) {
    parts.push('<div class="card">')
    parts.push(`<h3>${escapeHtml(lesson.title || lesson.id)}</h3>`)
    if (lesson.goal) parts.push(`<p><strong>目标</strong>：${escapeHtml(lesson.goal)}</p>`)
    if (Array.isArray(lesson.prerequisites) && lesson.prerequisites.length) {
      parts.push(`<p><strong>前置</strong>：${lesson.prerequisites.map(escapeHtml).join('、')}</p>`)
    }
    for (const section of lesson.sections || []) {
      if (section.heading) parts.push(`<h4>${escapeHtml(section.heading)}</h4>`)
      for (const block of blocksOf(section)) {
        if (block.kind === 'formula') {
          const uri = images.get(block.latex)
          parts.push('<div class="formula">')
          if (block.mathml) parts.push(block.mathml)
          if (uri) parts.push(`<img alt="${escapeHtml(block.alt || block.read || '公式')}" src="${uri}">`)
          parts.push(`<div class="read">${escapeHtml(block.read || '')}</div>`)
          parts.push('</div>')
        } else if (block.kind === 'image') {
          const uri = block.src && block.src.startsWith('data:') ? block.src : images.get(block.src) || null
          if (uri) parts.push(`<p><img alt="${escapeHtml(block.alt || '')}" src="${uri}" style="max-width:100%"></p>`)
        } else if (block.kind === 'table') {
          const rows = block.rows || []
          if (rows.length) {
            parts.push('<table>')
            parts.push(`<thead><tr>${rows[0].map((cell) => `<th>${escapeHtml(cell)}</th>`).join('')}</tr></thead><tbody>`)
            for (const row of rows.slice(1)) parts.push(`<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
            parts.push('</tbody></table>')
          }
        } else if (block.kind === 'list') {
          const items = block.items || String(block.text || '').split('\n')
          parts.push(`<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`)
        } else if (block.kind === 'checkpoint') {
          parts.push(`<details><summary>检查题：${escapeHtml(block.text || block.question || '')}</summary><p>${escapeHtml(block.answer || '')}</p></details>`)
        } else if (block.kind === 'callout') {
          parts.push(`<blockquote>${escapeHtml(block.text || '')}</blockquote>`)
        } else if (block.kind === 'code') {
          // Monospace diagrams: preserve spacing exactly, no HTML reflow.
          parts.push(`<pre class="diagram">${escapeHtml(String(block.text || '').replace(/\s+$/, ''))}</pre>`)
        } else {
          parts.push(`<p>${linkify(block.text || '')}</p>`)
        }
      }
    }
    // SVG frame player intentionally omitted (see the Markdown branch note).
    parts.push('</div>')
  }

  if (Array.isArray(options.chunks) && options.chunks.length > 0) {
    parts.push('<h2>离线检索</h2>')
    parts.push('<input type="search" id="kb-query" placeholder="在资料片段中检索（本文件自带索引）">')
    parts.push('<div id="kb-results"></div>')
    parts.push(`<script type="application/json" id="kb-data">${JSON.stringify(options.chunks).replace(/</g, '\\u003c')}</script>`)
    parts.push(SEARCH_JS)
  }

  if (Array.isArray(state.warnings) && state.warnings.length > 0) {
    parts.push('<h2>构建警告</h2><ul>')
    for (const warning of state.warnings) parts.push(`<li>${escapeHtml(warning.message)}</li>`)
    parts.push('</ul>')
  }

  parts.push(`</main></body></html>`)
  return parts.join('\n')
}

function linkify(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`)
}

/** A compact layered DAG for the export. */
export function renderGraphSvg(state) {
  const nodes = state.graph?.nodes || []
  const edges = state.graph?.edges || []
  if (nodes.length === 0) return '<p>（暂无图谱）</p>'
  const layers = layering(nodes, edges)
  const width = 960
  const rowHeight = 92
  const height = Math.max(200, layers.length * rowHeight + 60)
  const columns = Math.max(...layers.map((layer) => layer.length), 1)
  const positions = new Map()
  layers.forEach((layer, layerIndex) => {
    layer.forEach((node, columnIndex) => {
      const x = ((columnIndex + 1) / (layer.length + 1)) * width
      const y = 50 + layerIndex * rowHeight
      positions.set(node.id, { x, y })
    })
  })
  const parts = [`<svg viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="前置知识图谱" style="background:var(--layer);border:1px solid var(--line);border-radius:12px">`]
  for (const edge of edges) {
    const from = positions.get(edge.from)
    const to = positions.get(edge.to)
    if (!from || !to) continue
    parts.push(`<path d="M${from.x},${from.y + 16} C${from.x},${(from.y + to.y) / 2} ${to.x},${(from.y + to.y) / 2} ${to.x},${to.y - 16}" fill="none" stroke="var(--line)" stroke-width="1.4" marker-end="url(#exportArrow)"/>`)
  }
  parts.push('<defs><marker id="exportArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="var(--muted)"/></marker></defs>')
  for (const node of nodes) {
    const position = positions.get(node.id)
    if (!position) continue
    const tone = node.status === 'ready' ? 'var(--ok)' : node.status === 'partial' ? 'var(--warn)' : 'var(--err)'
    const label = String(node.label || node.id)
    parts.push(`<rect x="${position.x - 78}" y="${position.y - 16}" width="156" height="32" rx="8" fill="none" stroke="${tone}" stroke-width="1.6"/>`)
    parts.push(`<text x="${position.x}" y="${position.y + 4}" text-anchor="middle" font-size="12" fill="var(--ink)">${escapeHtml(label.slice(0, 18))}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

function layering(nodes, edges) {
  const incoming = new Map(nodes.map((node) => [node.id, 0]))
  const outgoing = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of edges) {
    if (!incoming.has(edge.to) || !outgoing.has(edge.from)) continue
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1)
    outgoing.get(edge.from).push(edge.to)
  }
  const depth = new Map()
  const queue = nodes.filter((node) => (incoming.get(node.id) || 0) === 0).map((node) => node.id)
  for (const id of queue) depth.set(id, 0)
  let guard = 0
  while (queue.length > 0 && guard < 10000) {
    guard += 1
    const id = queue.shift()
    for (const next of outgoing.get(id) || []) {
      const candidate = (depth.get(id) || 0) + 1
      if (candidate > (depth.get(next) ?? 0)) depth.set(next, candidate)
      queue.push(next)
    }
  }
  for (const node of nodes) if (!depth.has(node.id)) depth.set(node.id, layersCount(nodes))
  const layers = []
  for (const node of nodes) {
    const level = depth.get(node.id) || 0
    layers[level] = layers[level] || []
    layers[level].push(node)
  }
  return layers.filter(Boolean)
}

function layersCount(nodes) {
  return Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
}

/**
 * Write the three export files.
 * @param {object} config resolved config
 * @param {object} state folded state
 * @param {{sessionId:string, formulaImages?:Map<string,string>, frameImages?:Map<string,string>, chunks?:ReadonlyArray<object>, generatedAt?:number}} options
 */
export function writeExports(config, state, options) {
  const directory = exportDir(config, options.sessionId)
  const stamp = new Date(options.generatedAt || Date.now())
  const markdown = renderMarkdown(state, {
    formulaImages: options.formulaImages,
    sessionId: options.sessionId,
    generatedAt: options.generatedAt,
  })
  const html = renderHtml(state, {
    formulaImages: options.formulaImages,
    frames: options.frameImages,
    chunks: options.chunks,
    sessionId: options.sessionId,
    generatedAt: options.generatedAt,
  })
  const normalized = {
    ...state,
    exportedAt: stamp.toISOString(),
    sessionId: options.sessionId,
  }
  const files = [
    writeText(join(directory, 'study-notes.md'), markdown),
    writeText(join(directory, 'study.html'), html),
    writeText(join(directory, 'study.json'), JSON.stringify(normalized, null, 2)),
  ]
  return { directory, files }
}
