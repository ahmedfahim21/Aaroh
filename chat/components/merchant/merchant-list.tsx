'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { MerchantInfo } from '@/app/api/merchants/route'

export function MerchantList() {
  const [merchants, setMerchants] = useState<MerchantInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({})
  const [logs, setLogs] = useState<Record<string, string[]>>({})
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({})
  const logRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const fetchMerchants = useCallback(async () => {
    const res = await fetch('/api/merchants')
    if (res.ok) setMerchants(await res.json())
    setLoading(false)
  }, [])

  // Fetch once on mount; poll every 15s only while merchants are running (crash detection)
  const hasRunning = merchants.some((m) => m.running)
  useEffect(() => {
    fetchMerchants()
  }, [fetchMerchants])

  useEffect(() => {
    if (!hasRunning) return
    const id = setInterval(fetchMerchants, 15_000)
    return () => clearInterval(id)
  }, [hasRunning, fetchMerchants])

  // Poll logs only for merchants whose log panel is open
  const expandedSlugs = Object.entries(expandedLogs)
    .filter(([, open]) => open)
    .map(([slug]) => slug)

  useEffect(() => {
    if (!expandedSlugs.length) return

    const fetchLogs = async () => {
      await Promise.all(
        expandedSlugs.map(async (slug) => {
          const res = await fetch(`/api/merchants/${slug}`)
          if (res.ok) {
            const data = await res.json()
            setLogs((prev) => ({ ...prev, [slug]: data.logs }))
          }
        }),
      )
    }
    fetchLogs()
    const id = setInterval(fetchLogs, 3000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedSlugs.join(',')])

  // Auto-scroll logs to bottom
  useEffect(() => {
    for (const [slug, expanded] of Object.entries(expandedLogs)) {
      if (expanded) {
        const el = logRefs.current[slug]
        if (el) el.scrollTop = el.scrollHeight
      }
    }
  }, [logs, expandedLogs])

  const handleAction = async (slug: string, action: 'start' | 'stop') => {
    setActionLoading((prev) => ({ ...prev, [slug]: true }))
    try {
      const res = await fetch(`/api/merchants/${slug}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) alert(data.error ?? 'Action failed.')
      await fetchMerchants()
    } finally {
      setActionLoading((prev) => ({ ...prev, [slug]: false }))
    }
  }

  const toggleLogs = (slug: string) => {
    setExpandedLogs((prev) => ({ ...prev, [slug]: !prev[slug] }))
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading merchants…</p>
  }

  if (!merchants.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No merchants onboarded yet.{' '}
          <a href="/merchants/onboard" className="underline hover:text-foreground">
            Onboard one now →
          </a>
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {merchants.map((m) => (
        <MerchantCard
          key={m.slug}
          merchant={m}
          logs={logs[m.slug] ?? []}
          logsExpanded={!!expandedLogs[m.slug]}
          isActing={!!actionLoading[m.slug]}
          logRef={(el) => { logRefs.current[m.slug] = el }}
          onStart={() => handleAction(m.slug, 'start')}
          onStop={() => handleAction(m.slug, 'stop')}
          onToggleLogs={() => toggleLogs(m.slug)}
        />
      ))}
    </div>
  )
}

function MerchantCard({
  merchant,
  logs,
  logsExpanded,
  isActing,
  logRef,
  onStart,
  onStop,
  onToggleLogs,
}: {
  merchant: MerchantInfo
  logs: string[]
  logsExpanded: boolean
  isActing: boolean
  logRef: (el: HTMLDivElement | null) => void
  onStart: () => void
  onStop: () => void
  onToggleLogs: () => void
}) {
  const { name, slug, categories, running, port, startedAt } = merchant

  return (
    <div className={`rounded-lg border bg-card p-4 transition-colors ${running ? 'border-green-200 dark:border-green-800' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${running ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}
            />
            <h2 className="font-medium truncate">{name}</h2>
            <span className="text-xs text-muted-foreground shrink-0">/{slug}</span>
          </div>

          {categories.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {running && port && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Running on{' '}
              <a
                href={`http://localhost:${port}/.well-known/ucp`}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline hover:text-foreground"
              >
                localhost:{port}
              </a>
              {startedAt && (
                <> · started {new Date(startedAt).toLocaleTimeString()}</>
              )}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {running && (
            <button
              type="button"
              onClick={onToggleLogs}
              className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
            >
              {logsExpanded ? 'Hide logs' : 'Logs'}
            </button>
          )}
          {running ? (
            <button
              type="button"
              onClick={onStop}
              disabled={isActing}
              className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400"
            >
              {isActing ? 'Stopping…' : 'Stop'}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={isActing || !merchant.hasProducts}
              title={!merchant.hasProducts ? 'products.db not found' : undefined}
              className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400"
            >
              {isActing ? 'Starting…' : 'Start'}
            </button>
          )}
        </div>
      </div>

      {logsExpanded && (
        <div
          ref={logRef}
          className="mt-3 max-h-48 overflow-y-auto rounded-md bg-black/90 p-3 font-mono text-xs text-green-400"
        >
          {logs.length === 0 ? (
            <span className="text-slate-500">No logs yet…</span>
          ) : (
            logs.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: log lines
              <div key={i} className="leading-5">
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
