import { useState, useEffect, useCallback } from 'react'

const API_BASE = '/api/dataverse-proxy'

export function useFetch(path, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${API_BASE}/${path}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      setData(json.value || json)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { refetch() }, deps)

  return { data, loading, error, refetch }
}

export async function dvFetch(path) {
  const resp = await fetch(`${API_BASE}/${path}`)
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const json = await resp.json()
  return json.value || json
}

export async function dvPost(path, body) {
  const resp = await fetch(`${API_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`)
  if (resp.status === 204) return {}
  return resp.json()
}

export async function dvPatch(path, body) {
  const resp = await fetch(`${API_BASE}/${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`)
  return {}
}

export async function dvDelete(path) {
  const resp = await fetch(`${API_BASE}/${path}`, { method: 'DELETE' })
  if (!resp.ok && resp.status !== 204) throw new Error(`HTTP ${resp.status}`)
  return {}
}
