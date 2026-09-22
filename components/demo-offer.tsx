"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { message, messages, type Language } from "@/lib/i18n";
import type { DemoState } from "@/lib/demo";

export function useDemoStatus(refreshToken: number) {
  const [state, setState] = useState<DemoState>("loading");
  const [remaining, setRemaining] = useState(0);
  const [signInPath, setSignInPath] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    let active = true;
    setState("loading");
    void (async () => {
      try {
        const response = await fetch("/api/demo", { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        if (!response.ok) throw new Error("Demo unavailable");
        const data = await response.json() as { state?: unknown; remaining?: unknown; signInPath?: unknown } | null;
        const allowed = ["disabled", "signin", "available", "used", "limit", "unavailable"];
        if (typeof data?.state !== "string" || !allowed.includes(data.state)) throw new Error("Invalid demo status");
        if (typeof data.remaining !== "number" || !Number.isInteger(data.remaining) || data.remaining < 0 || data.remaining > 3 || (data.state === "available" && data.remaining === 0)) throw new Error("Invalid demo allowance");
        if (active) {
          setState(data.state as DemoState);
          setRemaining(data.remaining);
          setSignInPath(data.signInPath === "/signin-with-chatgpt?return_to=%2F" ? data.signInPath : null);
        }
      } catch {
        if (active) setState("unavailable");
      } finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [refreshToken]);
  return { state, remaining, signInPath };
}

export function DemoOffer({ language, state, remaining, signInPath, onConnect, busy }: {
  language: Language; state: DemoState; remaining: number; signInPath: string | null; onConnect: () => void; busy: boolean;
}) {
  const t = messages[language];
  const descriptions = { loading: t.demoLoading, disabled: t.demoDisabled, signin: t.demoSignIn, available: t.demoAvailable, used: t.demoUsed, limit: t.demoLimit, unavailable: t.demoUnavailable };
  return <aside className="demo-offer" aria-label={t.demoTitle}>
    <div><strong>{t.demoTitle}</strong><p role="status">{descriptions[state]}</p>
      {state === "available" && <p className="demo-balance" role="status">{message(language, "demoRemaining", { count: remaining })}</p>}
      {(state === "signin" || state === "available") && <small>{t.demoAttemptNote}</small>}
    </div>
    <div className="demo-actions">
      {state === "signin" && signInPath && <a className="demo-signin" href={signInPath} target="_top">{t.demoSignInButton}</a>}
      <Button type="button" variant="outline" disabled={busy} onClick={onConnect}><KeyRound size={16} />{t.demoOwnKey}</Button>
    </div>
  </aside>;
}
