/**
 * Speech recognition over the Host's speech service. The service does not
 * download models on its own, so this layer prepares the provider first and
 * reports progress instead of blocking a tool call forever.
 */

const DEFAULT_PROVIDER = 'sensevoice-local'

/** Readiness of the configured recogniser without changing it. */
export function speechSnapshot(context) {
  const service = context.speechToText
  if (!service || typeof service.snapshot !== 'function') {
    return { available: false, reason: 'speech-service-absent', providers: [] }
  }
  try {
    const snapshot = service.snapshot()
    const providers = (snapshot?.providers || []).map((provider) => ({
      id: provider.id,
      name: provider.name,
      location: provider.location,
      languages: provider.languages,
      preparation: provider.preparation,
    }))
    return {
      available: providers.length > 0,
      selected: snapshot?.selection?.providerId,
      language: snapshot?.selection?.language,
      providers,
    }
  } catch (error) {
    return { available: false, reason: String(error), providers: [] }
  }
}

/** Provider id to use, preferring the configured one when it is registered. */
export function resolveProvider(speech, preferred) {
  const providers = speech?.providers || []
  const wanted = preferred || DEFAULT_PROVIDER
  const exact = providers.find((provider) => provider.id === wanted)
  if (exact) return exact.id
  const first = providers.find((provider) => provider.location === 'host-local') || providers[0]
  return first ? first.id : undefined
}

/**
 * Ensure the recogniser can transcribe, starting preparation when needed.
 * @param {object} service `ctx.speechToText`
 * @param {string} providerId provider to prepare
 * @param {{timeoutMs?:number, onProgress?:(state:object)=>void}} options
 */
export async function ensureSpeechReady(service, providerId, options = {}) {
  if (!service) return { ok: false, code: 'SPEECH_UNAVAILABLE', message: 'The speech-to-text service is not mounted in this profile.' }
  const deadline = Date.now() + (options.timeoutMs || 20 * 60 * 1000)
  let started = false
  let last = null
  while (Date.now() < deadline) {
    const snapshot = speechSnapshot({ speechToText: service })
    const provider = (snapshot.providers || []).find((item) => item.id === providerId)
    if (!provider) {
      return { ok: false, code: 'SPEECH_PROVIDER_MISSING', message: `Speech provider ${providerId} is not registered.`, snapshot }
    }
    const preparation = provider.preparation || {}
    last = preparation
    if (preparation.phase === 'ready' || preparation.phase === 'standby') {
      return { ok: true, provider: providerId, phase: preparation.phase, snapshot }
    }
    if (preparation.phase === 'failed') {
      return {
        ok: false,
        code: 'SPEECH_PREPARE_FAILED',
        message: preparation.message || 'Speech preparation failed.',
        download: preparation.download,
        snapshot,
      }
    }
    if (options.onProgress) options.onProgress(preparation)
    if (!started && preparation.phase === 'unprepared') {
      try {
        service.prepare(providerId, options.downloadSource ? { downloadSource: options.downloadSource } : undefined)
        started = true
      } catch (error) {
        return { ok: false, code: 'SPEECH_PREPARE_REJECTED', message: String(error), snapshot }
      }
    }
    await sleep(1200)
  }
  return {
    ok: false,
    code: 'SPEECH_PREPARE_TIMEOUT',
    message: 'Speech preparation did not finish in time; call this tool again to check progress.',
    preparation: last,
  }
}

/**
 * Transcribe one WAV byte buffer.
 * @returns {Promise<{ok:true,text:string,seconds:number}|{ok:false,code:string,message:string}>}
 */
export async function transcribeBuffer(service, providerId, audio, language, signal) {
  if (!service) return { ok: false, code: 'SPEECH_UNAVAILABLE', message: 'speech service absent' }
  try {
    const request = { audio, providerId, language }
    const spec = service.resolve(request)
    const transcript = await service.transcribe(spec, signal || new AbortController().signal)
    return { ok: true, text: String(transcript?.text || ''), seconds: Number(transcript?.audioSeconds || 0) }
  } catch (error) {
    return { ok: false, code: 'SPEECH_TRANSCRIBE_FAILED', message: String(error && error.message ? error.message : error) }
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    if (typeof timer.unref === 'function') timer.unref()
  })
}
