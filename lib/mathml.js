/**
 * LaTeX to MathML through the bundled Temml build. Rendered once per distinct
 * formula and cached in process memory: the same formula appears in a lesson,
 * in the state payload and in an export, and only one conversion is needed.
 */

import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { latexToReadable } from './formula.js'

const cache = new Map()
let temmlPromise = null

async function loadTemml(pluginRootValue) {
  if (temmlPromise) return temmlPromise
  temmlPromise = (async () => {
    const candidates = [
      join(pluginRootValue, 'vendor', 'temml.mjs'),
      join(pluginRootValue, 'vendor', 'temml.js'),
    ]
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue
      try {
        const module = await import(pathToFileURL(candidate).href)
        const temml = module.default && typeof module.default.renderToString === 'function' ? module.default : module
        if (temml && typeof temml.renderToString === 'function') return temml
      } catch {
        continue
      }
    }
    return null
  })()
  return temmlPromise
}

/**
 * Convert one LaTeX formula to MathML.
 * @param {string} pluginRootValue plugin directory
 * @param {string} latex formula source
 * @returns {Promise<{latex:string, mathml:string, read:string}|null>}
 */
export async function toMathml(pluginRootValue, latex) {
  const source = String(latex || '').trim()
  if (!source) return null
  if (cache.has(source)) return cache.get(source)
  const temml = await loadTemml(pluginRootValue)
  let mathml = ''
  if (temml) {
    try {
      mathml = temml.renderToString(source, { displayMode: true, throwOnError: false })
    } catch {
      mathml = ''
    }
  }
  const result = {
    latex: source,
    mathml,
    read: latexToReadable(source),
  }
  cache.set(source, result)
  return result
}

/** Attach MathML to every formula occurrence in a list, keeping order. */
export async function annotate(pluginRootValue, items) {
  const output = []
  for (const item of items || []) {
    const converted = await toMathml(pluginRootValue, item.latex)
    output.push({ ...item, ...(converted || {}) })
  }
  return output
}

/** Minimal stylesheet a MathML tree needs to look right outside Temml's CSS. */
export const MATHML_CSS = `
math{font-family:"Cambria Math","STIX Two Math","Latin Modern Math","Noto Sans Math",math,serif;font-style:normal;font-weight:normal;line-height:1.2;text-indent:0;text-transform:none;letter-spacing:normal;word-wrap:normal;direction:ltr;font-size:1.05em}
math mtd,math mtable{font-style:normal}
math mi{font-style:italic}
math mo{padding:0 0.12em}
math mtext{font-style:normal}
`
