import { AppError } from "./i18n";

export const MAX_CONTEXT_CHARS = 30_000;
export type PdfContext = { name: string; text: string; pages: number; emptyPages: number };

export function contextLength(context: string, pdf?: PdfContext | null) {
  return context.trim().length + (pdf?.text.length || 0);
}

export function validateContext(context: string, pdf?: PdfContext | null) {
  if (contextLength(context, pdf) > MAX_CONTEXT_CHARS) throw new AppError("contextTooLong");
}
