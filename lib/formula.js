/**
 * Formula rendering. LaTeX goes in, and three human-facing forms come out:
 * MathML for the browser, PNG for chat and exports, and a plain reading plus a
 * spoken form for any environment that can render neither.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { formulaDir } from './paths.js'
import { pythonEnv } from './engines.js'
import { runWorker } from './proc.js'

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ',
  nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π',
  Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
}

const OPERATORS = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', times: '×',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
  equiv: '≡', propto: '∝', infty: '∞', in: '∈', notin: '∉', subset: '⊂',
  subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩', emptyset: '∅', forall: '∀',
  exists: '∃', nabla: '∇', partial: '∂', to: '→', rightarrow: '→', leftarrow: '←',
  Rightarrow: '⇒', Leftrightarrow: '⇔', cdots: '⋯', ldots: '…', dots: '…',
  because: '∵', therefore: '∴', times: '×',
}

const SUPERSCRIPT = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ', x: 'ˣ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', k: 'ᵏ', m: 'ᵐ', p: 'ᵖ', t: 'ᵗ',
}

const SUBSCRIPT = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', n: 'ₙ', o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', x: 'ₓ',
}

/** Stable cache key for one formula. */
export function formulaKey(latex) {
  return createHash('sha1').update(String(latex || '')).digest('hex').slice(0, 20)
}

/**
 * Turn LaTeX into a plain reading, mirroring the Python implementation so the
 * text path works even when Python cannot start.
 * @param {string} latex formula source
 */
export function latexToReadable(latex) {
  let text = String(latex || '').trim()
  if (text.startsWith('$$') && text.endsWith('$$') && text.length > 4) text = text.slice(2, -2)
  else if (text.startsWith('$') && text.endsWith('$') && text.length > 2) text = text.slice(1, -1)
  text = text.replace(/\\(?:left|right|big|Big|bigg|Bigg)\b/g, '')
  text = text.replace(/\\(?:displaystyle|limits|quad|qquad)\b/g, ' ')
  text = text.replace(/\\(?:,|;|:|!)/g, ' ')
  text = text.replace(/\\hspace\*?\{[^}]*\}/g, ' ')

  for (let pass = 0; pass < 4; pass += 1) {
    const before = text
    text = text.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
    text = text.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)')
    text = text.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
    if (text === before) break
  }

  text = text.replace(/\\(?:text|textbf|textit|textrm|mathrm|mathbb|mathcal|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, '$1')
  text = text.replace(/\\sum\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}/g, 'Σ($1..$2)')
  text = text.replace(/\\sum\s*\^\s*\{([^{}]*)\}\s*_\s*\{([^{}]*)\}/g, 'Σ($2..$1)')
  text = text.replace(/\\sum\s*_\s*\{([^{}]*)\}/g, 'Σ($1)')
  text = text.replace(/\\prod\s*_\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}/g, 'Π($1..$2)')
  text = text.replace(/\\sum\b/g, 'Σ')
  text = text.replace(/\\prod\b/g, 'Π')
  text = text.replace(/\\int\s*_\s*\{?([^{}\s^]*)\}?\s*\^\s*\{?([^{}\s]*)\}?/g, '∫[$1,$2]')
  text = text.replace(/\\int\s*_\s*\{([^{}]*)\}/g, '∫[$1]')
  text = text.replace(/\\int\b/g, '∫')
  text = text.replace(/\\lim\b/g, 'lim')

  text = text.replace(/\\([A-Za-z]+)/g, (whole, name) => OPERATORS[name] || GREEK[name] || name)
  text = text.replace(/\^\s*\{([^{}]*)\}/g, (whole, body) => mapChars(body, SUPERSCRIPT))
  text = text.replace(/\^\s*(\w)/g, (whole, body) => mapChars(body, SUPERSCRIPT))
  text = text.replace(/_\s*\{([^{}]*)\}/g, (whole, body) => mapChars(body, SUBSCRIPT))
  text = text.replace(/_\s*(\w)/g, (whole, body) => mapChars(body, SUBSCRIPT))
  return text.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

function mapChars(body, table) {
  return Array.from(String(body || '')).map((char) => table[char] ?? char).join('')
}

/**
 * Render every LaTeX formula with the Python worker, reusing cached images.
 * @param {object} engines resolved engines
 * @param {{config:object}} context
 * @param {ReadonlyArray<{id?:string, latex:string}>} items
 * @returns {Promise<{items:Array<{id:string,latex:string,read:string,alt:string,imagePath:string|null,imageRef:string|null}>,rasterised:boolean}>}
 */
export async function renderFormulas(engines, config, items) {
  const directory = formulaDir(config)
  const pending = []
  const known = new Map()
  for (const [index, item] of items.entries()) {
    const latex = String(item.latex || '').trim()
    if (!latex) continue
    const id = String(item.id || `f${index + 1}`)
    const key = formulaKey(latex)
    const imagePath = join(directory, `${key}.png`)
    if (existsSync(imagePath)) known.set(`${id}|${key}`, imagePath)
    else pending.push({ id: `${id}|${key}`, latex })
  }

  let rasterised = false
  let workerItems = []
  if (pending.length > 0 && engines.available.python) {
    const script = join(engines.pluginRoot, 'scripts', 'math_service.py')
    if (existsSync(script)) {
      const reply = await runWorker(script, {
        op: 'render',
        items: pending,
        pandoc: engines.available.pandoc ? engines.pandoc : '',
        node: engines.node || '',
        libreofficeCli: engines.available.libreoffice ? engines.libreofficeCli : '',
        dpi: 300,
      }, {
        python: engines.python,
        env: pythonEnv(engines),
        timeoutMs: 6 * 60 * 1000,
      })
      if (reply && reply.ok && Array.isArray(reply.items)) {
        workerItems = reply.items
        rasterised = Boolean(reply.rasterised)
        for (const rendered of workerItems) {
          if (!rendered.png) continue
          const key = String(rendered.id).split('|')[1]
          if (!key) continue
          const target = join(directory, `${key}.png`)
          writeFileSync(target, Buffer.from(rendered.png, 'base64'))
          known.set(rendered.id, target)
        }
      }
    }
  }

  const workerById = new Map(workerItems.map((item) => [item.id, item]))
  const output = []
  for (const [index, item] of items.entries()) {
    const latex = String(item.latex || '').trim()
    if (!latex) continue
    const id = String(item.id || `f${index + 1}`)
    const key = formulaKey(latex)
    const lookup = `${id}|${key}`
    const rendered = workerById.get(lookup)
    output.push({
      id,
      latex,
      read: rendered?.read || latexToReadable(latex),
      alt: rendered?.alt || latexToReadable(latex),
      imagePath: known.get(lookup) || null,
      imageRef: { formula: key, name: `${key}.png` },
    })
  }
  return { items: output, rasterised }
}

/** Base64 payload of one rendered formula, for chat image blocks. */
export function formulaImageBase64(imagePath) {
  try {
    return readFileSync(imagePath).toString('base64')
  } catch {
    return null
  }
}
