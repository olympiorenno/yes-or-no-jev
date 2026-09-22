"use client";

import { useEffect, useState } from "react";
import { ChartNoAxesColumnIncreasing, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localeFor, messages, type Language } from "@/lib/i18n";

export function UsageCounter({ language, refreshToken }: { language: Language; refreshToken: number }) {
  const t = messages[language];
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") setReload(value => value + 1); };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let active = true;
    setLoading(true);
    setFailed(false);
    void (async () => {
      try {
        const response = await fetch("/api/usage", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Counter unavailable");
        const value = (await response.json() as { total?: unknown } | null)?.total;
        if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid counter");
        if (active) setTotal(value);
      } catch {
        if (active) setFailed(true);
      } finally {
        clearTimeout(timer);
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [refreshToken, reload]);

  return <section className="usage-counter" aria-label={t.usageTitle}>
    <ChartNoAxesColumnIncreasing size={22} aria-hidden="true" />
    <div className="usage-counter-copy">
      <p aria-live="polite" aria-atomic="true">
        {failed ? t.usageUnavailable : loading && total === null ? t.usageLoading : <><strong>{(total ?? 0).toLocaleString(localeFor(language))}</strong> {t.usageTitle}</>}
      </p>
      <span>{t.usageNote}</span>
    </div>
    <Button type="button" variant="ghost" className="usage-refresh" disabled={loading} aria-label={t.usageRefresh} title={t.usageRefresh} onClick={() => setReload(value => value + 1)}>
      <RefreshCw size={17} className={loading ? "spin" : undefined} aria-hidden="true" />
    </Button>
  </section>;
}
