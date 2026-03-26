import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api/dataverse-proxy'

async function safeJson(resp) {
  const text = await resp.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Expected JSON but got: ${text.substring(0, 120)}`)
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
      const resp = await fetch(`${API_BASE}/${path}`)
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
  const resp = await fetch(`${API_BASE}/${path}`)
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}${body ? ': ' + body.substring(0, 200) : ''}`)
  }
  const json = await safeJson(resp)
  return json?.value || json
}

export async function dvPost(path, body) {
  const resp = await fetch(`${API_BASE}/${path}`, {
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
  const resp = await fetch(`${API_BASE}/${path}`, {
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
  const resp = await fetch(`${API_BASE}/${path}`, { method: 'DELETE' })
  if (!resp.ok && resp.status !== 204) {
    const errBody = await resp.text().catch(() => '')
    throw new Error(`HTTP ${resp.status}${errBody ? ': ' + errBody.substring(0, 200) : ''}`)
  }
  return {}
}
