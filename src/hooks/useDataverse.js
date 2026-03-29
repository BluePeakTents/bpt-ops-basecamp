import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api/dataverse-proxy'
const DEFAULT_TIMEOUT = 15000 // 15 seconds
const MAX_RETRIES = 2
const RETRY_CODES = new Set([429, 500, 502, 503, 504])

async function safeJson(resp) {
  const text = await resp.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Expected JSON but got: ${text.substring(0, 120)}`)
  }
}

/**
 * Core fetch with timeout, retry, and exponential backoff.
 * Retries on 429/5xx up to MAX_RETRIES times with backoff.
 */
async function resilientFetch(url, options = {}, retries = MAX_RETRIES) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeout || DEFAULT_TIMEOUT)

  try {
    const resp = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeout)

    // Retry on transient failures
    if (!resp.ok && RETRY_CODES.has(resp.status) && retries > 0) {
      const delay = resp.status === 429
        ? Math.min(parseInt(resp.headers.get('Retry-After') || '2', 10) * 1000, 10000)
        : (MAX_RETRIES - retries + 1) * 1500
      await new Promise(r => setTimeout(r, delay))
      return resilientFetch(url, options, retries - 1)
    }

    return resp
  } catch (e) {
    clearTimeout(timeout)
    if (e.name === 'AbortError') {
      throw new Error('Request timed out — Dataverse may be slow or unavailable.')
    }
    // Retry on network errors (fetch itself failed)
    if (retries > 0) {
      await new Promise(r => setTimeout(r, (MAX_RETRIES - retries + 1) * 1500))
      return resilientFetch(url, options, retries - 1)
    }
    throw e
  }
}

export function useFetch(path, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await resilientFetch(`${API_BASE}/${path}`)
      if (!resp.ok) {
        const body = await resp.text().catch(() => '')
        throw new Error(`HTTP ${resp.status}${body ? ': ' + body.substring(0, 200) : ''}`)
      }
      const json = await safeJson(resp)
      setData(json?.value || json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refetch() }, [refetch, ...deps])

  return { data, loading, error, refetch }
}

export async function dvFetch(path) {
  const resp = await resilientFetch(`${API_BASE}/${path}`)
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}${body ? ': ' + body.substring(0, 200) : ''}`)
  }
  const json = await safeJson(resp)
  return json?.value || json
}

export async function dvPost(path, body) {
  const resp = await resilientFetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!resp.ok && resp.status !== 204) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}${errBody ? ': ' + errBody.substring(0, 200) : ''}`)
  }
  if (resp.status === 204) return {}
  return await safeJson(resp) || {}
}

export async function dvPatch(path, body) {
  const resp = await resilientFetch(`${API_BASE}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!resp.ok && resp.status !== 204) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}${errBody ? ': ' + errBody.substring(0, 200) : ''}`)
  }
  return {}
}

export async function dvDelete(path) {
  const resp = await resilientFetch(`${API_BASE}/${path}`, { method: 'DELETE' })
  if (!resp.ok && resp.status !== 204) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}${errBody ? ': ' + errBody.substring(0, 200) : ''}`)
  }
  return {}
}
