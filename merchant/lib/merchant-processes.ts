/**
 * Module-level process registry for running merchant UCP servers.
 * Persists across requests within a single Next.js server instance.
 */
import type { ChildProcess } from 'node:child_process'

export interface MerchantProcess {
  process: ChildProcess
  port: number
  slug: string
  startedAt: string // ISO string
  logs: string[]    // last N lines of stdout/stderr
}

const MAX_LOG_LINES = 200

// Singleton registry — survives hot reloads via module cache
declare global {
  // eslint-disable-next-line no-var
  var __merchantProcesses: Map<string, MerchantProcess> | undefined
}

export const runningProcesses: Map<string, MerchantProcess> =
  globalThis.__merchantProcesses ?? (globalThis.__merchantProcesses = new Map())

export function getNextPort(): number {
  const used = new Set([...runningProcesses.values()].map((p) => p.port))
  let port = 8000
  while (used.has(port)) port++
  return port
}

export function appendLog(slug: string, line: string) {
  const entry = runningProcesses.get(slug)
  if (!entry) return
  entry.logs.push(line)
  if (entry.logs.length > MAX_LOG_LINES) entry.logs.shift()
}
