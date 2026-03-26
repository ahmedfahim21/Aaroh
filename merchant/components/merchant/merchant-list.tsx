"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantInfo } from "@/app/api/merchants/route";

export function MerchantList() {
  const [merchants, setMerchants] = useState<MerchantInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [logs, setLogs] = useState<Record<string, string[]>>({});
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const logRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchMerchants = useCallback(async () => {
    const res = await fetch("/api/merchants");
    if (res.ok) setMerchants(await res.json());
    setLoading(false);
  }, []);

  // Fetch once on mount; poll every 15s only while merchants are running (crash detection)
  const hasRunning = merchants.some((m) => m.running);
  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  useEffect(() => {
    if (!hasRunning) return;
    const id = setInterval(fetchMerchants, 15_000);
    return () => clearInterval(id);
  }, [hasRunning, fetchMerchants]);

  // Poll logs only for merchants whose log panel is open
  const expandedSlugs = Object.entries(expandedLogs)
    .filter(([, open]) => open)
    .map(([slug]) => slug);

  useEffect(() => {
    if (!expandedSlugs.length) return;

    const fetchLogs = async () => {
      await Promise.all(
        expandedSlugs.map(async (slug) => {
          const res = await fetch(`/api/merchants/${slug}`);
          if (res.ok) {
            const data = await res.json();
            setLogs((prev) => ({ ...prev, [slug]: data.logs }));
          }
        })
      );
    };
    fetchLogs();
    const id = setInterval(fetchLogs, 3000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedSlugs.join(",")]);

  // Auto-scroll logs to bottom
  useEffect(() => {
    for (const [slug, expanded] of Object.entries(expandedLogs)) {
      if (expanded) {
        const el = logRefs.current[slug];
        if (el) el.scrollTop = el.scrollHeight;
      }
    }
  }, [logs, expandedLogs]);

  const handleAction = async (slug: string, action: "start" | "stop") => {
    setActionLoading((prev) => ({ ...prev, [slug]: true }));
    try {
      const res = await fetch(`/api/merchants/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error ?? "Action failed.");
      await fetchMerchants();
    } finally {
      setActionLoading((prev) => ({ ...prev, [slug]: false }));
    }
  };

  const toggleLogs = (slug: string) => {
    setExpandedLogs((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading merchants…</p>;
  }

  if (!merchants.length) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No merchants onboarded yet.{" "}
          <a
            className="underline hover:text-foreground"
            href="/onboard"
          >
            Onboard one now →
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {merchants.map((m) => (
        <MerchantCard
          isActing={!!actionLoading[m.slug]}
          key={m.slug}
          logRef={(el) => {
            logRefs.current[m.slug] = el;
          }}
          logs={logs[m.slug] ?? []}
          logsExpanded={!!expandedLogs[m.slug]}
          merchant={m}
          onStart={() => handleAction(m.slug, "start")}
          onStop={() => handleAction(m.slug, "stop")}
          onToggleLogs={() => toggleLogs(m.slug)}
        />
      ))}
    </div>
  );
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
  merchant: MerchantInfo;
  logs: string[];
  logsExpanded: boolean;
  isActing: boolean;
  logRef: (el: HTMLDivElement | null) => void;
  onStart: () => void;
  onStop: () => void;
  onToggleLogs: () => void;
}) {
  const {
    name,
    slug,
    categories,
    tags,
    description,
    running,
    port,
    startedAt,
  } = merchant;

  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-colors ${running ? "border-green-200 dark:border-green-800" : ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${running ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`}
            />
            <h2 className="font-medium truncate">{name}</h2>
            <span className="text-xs text-muted-foreground shrink-0">
              /{slug}
            </span>
          </div>

          {description ? (
            <p className="mt-1.5 text-sm text-muted-foreground line-clamp-3">
              {description}
            </p>
          ) : null}

          {categories.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {categories.map((c) => (
                <span
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
                  key={c}
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 items-center">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                Tags
              </span>
              {tags.map((t) => (
                <span
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-foreground"
                  key={t}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {running && port && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Running on{" "}
              <a
                className="font-mono underline hover:text-foreground"
                href={`http://localhost:${port}/.well-known/ucp`}
                rel="noreferrer"
                target="_blank"
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
              className="rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted"
              onClick={onToggleLogs}
              type="button"
            >
              {logsExpanded ? "Hide logs" : "Logs"}
            </button>
          )}
          {running ? (
            <button
              className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400"
              disabled={isActing}
              onClick={onStop}
              type="button"
            >
              {isActing ? "Stopping…" : "Stop"}
            </button>
          ) : (
            <button
              className="rounded-md bg-green-100 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400"
              disabled={isActing || !merchant.hasProducts}
              onClick={onStart}
              title={merchant.hasProducts ? undefined : "products.db not found"}
              type="button"
            >
              {isActing ? "Starting…" : "Start"}
            </button>
          )}
        </div>
      </div>

      {logsExpanded && (
        <div
          className="mt-3 max-h-48 overflow-y-auto rounded-md bg-black/90 p-3 font-mono text-xs text-green-400"
          ref={logRef}
        >
          {logs.length === 0 ? (
            <span className="text-slate-500">No logs yet…</span>
          ) : (
            logs.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: log lines
              <div className="leading-5" key={i}>
                {line}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
