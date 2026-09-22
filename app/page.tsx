"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, CircleHelp, Copy, FileText, Globe2, KeyRound, Languages, LoaderCircle, Paperclip, Plus, ShieldCheck, TriangleAlert, Unplug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { evaluateQuestion, type Evaluation } from "@/lib/jev";
import { AppError, examples, localeFor, message, messages, type Language, type MessageKey } from "@/lib/i18n";
import { contextLength, MAX_CONTEXT_CHARS, validateContext, type PdfContext } from "@/lib/context";
import { readPdf } from "@/lib/pdf";
import { UsageCounter } from "@/components/usage-counter";

export default function Home() {
  const [language, setLanguage] = useState<Language>("pt");
  const t = messages[language];
  const locale = localeFor(language);
  const percent = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n * 100);
  const number = (n: number) => n.toLocaleString(locale);
  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [pdf, setPdf] = useState<PdfContext | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<AppError | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ page: number; total: number } | null>(null);
  const [readingName, setReadingName] = useState("");
  const [search, setSearch] = useState(true);
  const [key, setKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyUsed, setKeyUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<MessageKey | null>(null);
  const [result, setResult] = useState<Evaluation | null>(null);
  const [usageRefresh, setUsageRefresh] = useState(0);
  const [error, setError] = useState<AppError | null>(null);
  const [copied, setCopied] = useState(false);
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [submittedPdf, setSubmittedPdf] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const active = useRef<AbortController | null>(null);
  const pdfActive = useRef<AbortController | null>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const questionInput = useRef<HTMLTextAreaElement>(null);
  const inFlight = useRef(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const contextChars = contextLength(context, pdf);
  const contextTooLong = contextChars > MAX_CONTEXT_CHARS;

  useEffect(() => {
    try { const saved = localStorage.getItem("jev-language"); if (saved === "pt" || saved === "en") setLanguage(saved); } catch { /* Device preferences are optional. */ }
    return () => { active.current?.abort(); pdfActive.current?.abort(); if (copyTimer.current) clearTimeout(copyTimer.current); };
  }, []);
  useEffect(() => {
    document.documentElement.lang = localeFor(language);
    document.title = `${messages[language].brand} · Jev`;
  }, [language]);

  function changeLanguage(value: string) {
    if (value !== "pt" && value !== "en") return;
    setLanguage(value);
    try { localStorage.setItem("jev-language", value); } catch { /* Keep working without browser storage. */ }
  }

  function removePdf() {
    pdfActive.current?.abort(); pdfActive.current = null;
    setPdf(null); setPdfBusy(false); setPdfError(null); setPdfProgress(null); setReadingName(""); setResult(null);
    if (pdfInput.current) pdfInput.current.value = "";
  }

  async function attachPdf(file?: File) {
    if (!file || inFlight.current) return;
    pdfActive.current?.abort();
    const controller = new AbortController(); pdfActive.current = controller;
    setPdf(null); setPdfError(null); setPdfBusy(true); setPdfProgress(null); setReadingName(file.name); setResult(null); setError(null); setContextOpen(true);
    try {
      const document = await readPdf(file, controller.signal, (page, total) => { if (pdfActive.current === controller) setPdfProgress({ page, total }); });
      if (pdfActive.current === controller) setPdf(document);
    } catch (err) {
      if (pdfActive.current === controller && !controller.signal.aborted) setPdfError(err instanceof AppError ? err : new AppError("pdfInvalid"));
    } finally {
      if (pdfActive.current === controller) { setPdfBusy(false); pdfActive.current = null; }
    }
  }

  async function ask(value = question) {
    const trimmed = value.trim();
    if (inFlight.current) throw new AppError("inFlight");
    if (trimmed.length < 5) { setError(new AppError("questionShort")); questionInput.current?.focus(); return; }
    if (trimmed.length > 1500) { setError(new AppError("questionLong")); return; }
    if (pdfActive.current) { setError(new AppError("pdfWait")); return; }
    if (pdfError) { setError(pdfError); return; }
    try { validateContext(context, pdf); } catch (err) { setError(err as AppError); return; }
    if (!key) { setKeyOpen(true); return; }
    inFlight.current = true;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(null); setResult(null); setCopied(false); setSubmittedQuestion(trimmed); setSubmittedPdf(pdf?.name || "");
    try {
      const answer = await evaluateQuestion({ question: trimmed, context: context.trim(), pdf, language, apiKey: key, useReferences: search, signal: controller.signal, onPhase: setPhase });
      setResult(answer); setKeyUsed(true); setUsageRefresh(value => value + 1);
      requestAnimationFrame(() => resultHeading.current?.focus({ preventScroll: true }));
      return answer;
    } catch (err) {
      const failure = controller.signal.aborted ? new AppError("cancelled") : err instanceof AppError ? err : new AppError("genericError");
      setError(failure);
      if (failure.key === "invalidKey") { setKeyUsed(false); setKeyOpen(true); }
    } finally { inFlight.current = false; setBusy(false); setPhase(null); active.current = null; }
  }

  const askRef = useRef(ask); askRef.current = ask;
  const stateRef = useRef({ busy, key, language }); stateRef.current = { busy, key, language };
  useEffect(() => {
    type Registry = { registerTool(tool: object, options: { signal: AbortSignal }): void | Promise<void> };
    const registry = (document as Document & { modelContext?: Registry }).modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    try { void Promise.resolve(registry.registerTool({
      name: "ask_yes_no_question", title: "Ask Jev / Perguntar ao Jev",
      description: "Queries Jev using the current language, context and attached PDF. Uses credits from the connected TypeSafe account. Add the key through the interface, never as a tool argument.",
      inputSchema: { type: "object", properties: { question: { type: "string", minLength: 5, maxLength: 1500 } }, required: ["question"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: true },
      async execute(input: unknown) {
        const lang = stateRef.current.language;
        if (!input || typeof input !== "object" || !("question" in input) || typeof input.question !== "string" || Object.keys(input).some(k => k !== "question") || input.question.trim().length < 5 || input.question.length > 1500) throw new Error(message(lang, "invalidToolQuestion"));
        if (!stateRef.current.key) throw new Error(message(lang, "needKey"));
        if (stateRef.current.busy) throw new Error(message(lang, "inFlight"));
        setQuestion(input.question);
        const answer = await askRef.current(input.question);
        if (!answer) throw new Error(message(lang, "incomplete"));
        return { answer: answer.label, probabilityYes: answer.probabilityYes, reason: answer.reason, sources: answer.references.map(s => s.url) };
      },
    }, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Optional browser support. */ }
    return () => lifecycle.abort();
  }, []);

  async function copyAnswer() {
    if (!result) return;
    const text = `${submittedQuestion}\n${t[result.kind]}\n${t[result.reasonKey]}${result.probabilityYes === null ? "" : `\n${t.probabilityYes}: ${percent(result.probabilityYes)}%\n${t.probabilityNo}: ${percent(1 - result.probabilityYes)}%`}${submittedPdf ? `\n${message(language, "attachedContext", { name: submittedPdf })}` : ""}${result.references.length ? `\n${t.sources}: ${result.references.map(s => s.url).join(", ")}` : ""}`;
    try { await navigator.clipboard.writeText(text); setCopied(true); if (copyTimer.current) clearTimeout(copyTimer.current); copyTimer.current = setTimeout(() => setCopied(false), 2200); }
    catch { setError(new AppError("copyError")); }
  }
  function disconnect() { active.current?.abort(); setKey(""); setKeyDraft(""); setKeyUsed(false); setKeyOpen(false); }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#main" aria-label={t.home}><span className="brand-mark">{language === "en" ? "y" : "s"}<span>/</span>n</span><span className="brand-name">{t.brand}<span>{t.byline}</span></span></a>
      <div className="header-actions">
        <Select value={language} onValueChange={changeLanguage} disabled={busy}>
          <SelectTrigger className="language-picker" aria-label={t.language}><Languages size={17} /><SelectValue /></SelectTrigger>
          <SelectContent position="popper"><SelectItem value="pt">Português</SelectItem><SelectItem value="en">English</SelectItem></SelectContent>
        </Select>
        <Button variant="ghost" className="help-button" aria-label={t.help} onClick={() => setHelpOpen(true)}><CircleHelp size={18} /><span>{t.help}</span></Button>
        <Button variant="outline" className={`connect-button ${key ? "has-key" : ""}`} onClick={() => { setKeyDraft(""); setKeyOpen(true); }}><KeyRound size={16} />{key ? (keyUsed ? t.connected : t.keyAdded) : t.connect}</Button>
      </div>
    </header>
    <main id="main" className="workspace">
      <div className="intro"><p className="eyebrow"><span className="tiny-slash">/</span>{t.eyebrow}</p><h1>{t.title}</h1><p>{t.subtitle}</p></div>
      <aside className="experiment-notice" role="note" aria-labelledby="experiment-title">
        <TriangleAlert size={22} aria-hidden="true" />
        <div><strong id="experiment-title">{t.experimentTitle}</strong><p>{t.experimentNotice}</p></div>
      </aside>
      <div className="workspace-grid">
        <section className="question-panel" aria-labelledby="question-label">
          <form onSubmit={e => { e.preventDefault(); void ask(); }}>
            <div className="panel-title"><label id="question-label" htmlFor="question">{t.question}</label><span>01</span></div>
            <Textarea ref={questionInput} id="question" className="question-input" value={question} maxLength={1500} disabled={busy} onChange={e => { setQuestion(e.target.value); setError(null); }} placeholder={t.placeholder} aria-describedby="question-hint" onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !inFlight.current) { e.preventDefault(); void ask(); } }} />
            <div className="under-input"><span id="question-hint">{t.oneQuestion}</span><span>{number(question.length)} / {number(1500)}</span></div>
            <div className="context-controls">
              <button className="context-trigger" type="button" aria-expanded={contextOpen} aria-controls="extra-context" onClick={() => setContextOpen(!contextOpen)} disabled={busy}>{contextOpen ? <ChevronDown size={17} /> : <Plus size={17} />}{t.addContext}<span>{t.optional}</span></button>
              <Button type="button" variant="outline" className="attach-button" aria-describedby="pdf-sensitive-notice" disabled={busy || pdfBusy} onClick={() => pdfInput.current?.click()}><Paperclip size={16} />{pdf ? t.replacePdf : t.attachPdf}</Button>
              <Input ref={pdfInput} id="context-pdf" type="file" accept="application/pdf,.pdf" className="pdf-file-input" tabIndex={-1} aria-label={t.pdfInput} disabled={busy || pdfBusy} onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void attachPdf(file); }} />
            </div>
            <p id="pdf-sensitive-notice" className="sensitive-pdf-notice">{t.sensitivePdfNotice}</p>
            {contextOpen && <div id="extra-context" className="context-area">
              <label htmlFor="context">{t.contextLabel}</label><Textarea id="context" value={context} maxLength={MAX_CONTEXT_CHARS} disabled={busy} onChange={e => setContext(e.target.value)} placeholder={t.contextPlaceholder} />
              <p className={`context-count ${contextTooLong ? "over-limit" : ""}`}>{message(language, "contextCount", { count: number(contextChars) })}</p>
              <p className="pdf-hint">{t.pdfHint}</p>
            </div>}
            {(pdfBusy || pdf || pdfError) && <div className="pdf-attachment">
              <div className="pdf-heading"><FileText size={22} /><div><strong>{pdf?.name || readingName}</strong><span role="status">{pdfBusy ? (pdfProgress ? message(language, "pdfProgress", pdfProgress) : t.pdfReading) : pdf ? message(language, "pdfSummary", { pages: number(pdf.pages), characters: number(pdf.text.length) }) : t.pdfInvalid}</span></div><button type="button" onClick={removePdf} disabled={busy} aria-label={t.removePdf}><X size={19} /></button></div>
              {pdfError && <p className="pdf-error" role="alert">{message(language, pdfError.key, pdfError.values)}</p>}
              {pdf && <>
                {pdf.emptyPages > 0 && <p className="pdf-warning" role="status">{message(language, "pdfPartial", { count: pdf.emptyPages })}</p>}
                <details className="pdf-preview"><summary>{t.pdfPreview}</summary><pre>{pdf.text}</pre></details>
                <p className="pdf-privacy">{t.pdfPrivacy}</p>
              </>}
            </div>}
            {contextTooLong && <p className="error-message" role="alert">{t.contextTooLong}</p>}
            <div className="search-option"><div><Globe2 size={19} /><label htmlFor="references">{t.search}</label></div><Switch id="references" checked={search} onCheckedChange={setSearch} disabled={busy} aria-label={t.search} /></div>
            <p className="search-note">{t.searchNote}</p>
            {error && <div className="error-message" role="alert"><CircleHelp size={18} /><span>{message(language, error.key, error.values)}</span></div>}
            <div className="submit-row"><Button type="submit" className="ask-button" disabled={busy || pdfBusy || !!pdfError || contextTooLong || question.trim().length < 5}>{busy ? <><LoaderCircle size={20} className="spin" />{phase ? t[phase] : t.querying}</> : <>{t.ask}<ArrowUpRight size={21} /></>}</Button>{busy ? <Button type="button" variant="ghost" className="cancel-button" onClick={() => active.current?.abort()}>{t.cancel}</Button> : <span className="keyboard-hint">⌘ / Ctrl + Enter</span>}</div>
            {!key && <p className="connection-note"><KeyRound size={14} />{t.connecting}</p>}
          </form>
          <div className="examples"><p>{t.examples}</p>{examples[language].map(example => <button type="button" disabled={busy} key={example} onClick={() => { setQuestion(example); setError(null); setResult(null); questionInput.current?.focus(); }}>{example}<ArrowUpRight size={16} /></button>)}</div>
        </section>
        <section className={`answer-panel ${result ? result.kind : "empty"}`} aria-labelledby="answer-heading" aria-busy={busy}>
          <div className="answer-top"><span>{t.answer}</span><span className="answer-tag">{busy ? t.consulting : result ? "Jev" : t.waiting}</span></div>
          <div className="answer-content" aria-live="polite" aria-atomic="true">
            {busy ? <div className="empty-answer"><div className="orbit loading-orbit"><LoaderCircle className="spin" size={38} /></div><h2 id="answer-heading">{phase ? t[phase] : t.analyzing}</h2><p>{t.pleaseWait}</p></div>
              : !result ? <div className="empty-answer"><div className="orbit"><span>?</span></div><h2 id="answer-heading">{t.emptyTitle}</h2><p>{t.emptyLine}<br />{t.emptyDescription}</p></div>
              : <div className="result-content">
                <p className="asked-question">{submittedQuestion}</p>
                <div className="result-icon">{result.kind === "yes" ? <Check size={28} /> : result.kind === "no" ? <X size={28} /> : <CircleHelp size={28} />}</div>
                <h2 id="answer-heading" ref={resultHeading} tabIndex={-1} className="result-heading">{t[result.kind]}<span>.</span></h2>
                <p className="result-reason">{t[result.reasonKey]}</p>
                {result.probabilityYes !== null && <div className="probability"><div><span>{t.probabilityYes}</span><strong>{percent(result.probabilityYes)}%</strong></div><div className="probability-track" role="meter" aria-label={t.probabilityYes} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(result.probabilityYes * 100)}><span style={{ width: `${result.probabilityYes * 100}%` }} /></div><div className="probability-ends"><span>{t.no} · {percent(1 - result.probabilityYes)}%</span><span>{t.yes} · {percent(result.probabilityYes)}%</span></div></div>}
                {submittedPdf && <p className="reference-notice pdf-used"><FileText size={15} />{message(language, "attachedContext", { name: submittedPdf })}</p>}
                {result.references.length > 0 && <div className="result-sources"><h3>{t.sources}</h3>{result.references.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}<ArrowUpRight size={14} /></a>)}</div>}
                {result.referenceNotice && <p className="reference-notice">{result.referenceNoticeKey ? t[result.referenceNoticeKey] : result.referenceNotice}</p>}
                <div className="result-actions"><button onClick={copyAnswer}><Copy size={16} />{copied ? t.copied : t.copy}</button><span>{result.model}</span></div>
              </div>}
          </div>
          <div className="answer-footer"><ShieldCheck size={17} /><span>{t.estimateNote}</span></div>
        </section>
      </div>
      <UsageCounter language={language} refreshToken={usageRefresh} />
      <footer className="page-footer"><span>{t.footer}</span><a href="https://docs.typesafe.ai/primitives/noul" target="_blank" rel="noreferrer">{t.about}<ArrowUpRight size={13} /></a></footer>
    </main>
    <Dialog open={keyOpen} onOpenChange={open => { setKeyOpen(open); if (!open) setKeyDraft(""); }}>
      <DialogContent className="settings-dialog" showCloseButton={false}>
        <button className="modal-close" onClick={() => { setKeyOpen(false); setKeyDraft(""); }} aria-label={t.close}><X size={20} /></button>
        <DialogHeader><div className="modal-icon"><KeyRound size={23} /></div><DialogTitle>{t.connectTitle}</DialogTitle><DialogDescription>{t.connectDescription}</DialogDescription></DialogHeader>
        <ol className="setup-steps"><li><a href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">{t.openKeys}<ArrowUpRight size={13} /></a></li><li>{t.copyKey}</li></ol>
        <form onSubmit={e => { e.preventDefault(); const value = keyDraft.trim(); if (!value || /\s/.test(value)) return; setKey(value); setKeyUsed(false); setKeyDraft(""); setKeyOpen(false); setError(null); }}>
          <label htmlFor="api-key">{t.apiKey}</label><Input id="api-key" type="password" value={keyDraft} onChange={e => setKeyDraft(e.target.value)} autoComplete="off" spellCheck={false} placeholder={key ? t.replaceKey : t.keyPlaceholder} maxLength={512} />
          <p className="key-privacy"><ShieldCheck size={16} /><span>{t.keyPrivacy}</span></p><p className="billing-note">{t.billing}</p>
          <Button className="modal-submit" type="submit" disabled={!keyDraft.trim() || /\s/.test(keyDraft.trim())}>{t.useKey}<ArrowUpRight size={18} /></Button>
        </form>
        {key && <Button className="disconnect-button" variant="ghost" onClick={disconnect}><Unplug size={16} />{t.disconnect}</Button>}
      </DialogContent>
    </Dialog>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="settings-dialog help-dialog" showCloseButton={false}>
        <button className="modal-close" onClick={() => setHelpOpen(false)} aria-label={t.close}><X size={20} /></button>
        <DialogHeader><DialogTitle>{t.help}</DialogTitle><DialogDescription>{t.helpDescription}</DialogDescription></DialogHeader>
        <div className="help-content"><p><strong>{t.experimentTitle}.</strong> {t.experimentNotice}</p><p><strong>{t.helpQuestionTitle}</strong> {t.helpQuestion}</p><p><strong>{t.helpEvaluateTitle}</strong> {t.helpEvaluate}</p><p><strong>{t.helpAnswerTitle}</strong> {t.helpAnswer}</p><p>{t.helpBasis}</p><p>{t.helpCaution}</p><p>{t.helpLanguage}</p><p>{t.helpPdf}</p><p>{t.helpPrivacy}</p></div>
      </DialogContent>
    </Dialog>
  </div>;
}
