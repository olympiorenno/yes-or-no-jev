import { AppError } from "./i18n";
import { MAX_CONTEXT_CHARS, type PdfContext } from "./context";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 100;

export async function readPdf(file: File, signal: AbortSignal, onProgress: (page: number, total: number) => void): Promise<PdfContext> {
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") throw new AppError("pdfWrongType");
  if (file.size > MAX_PDF_BYTES) throw new AppError("pdfTooLarge");
  if (!file.size) throw new AppError("pdfInvalid");
  const data = new Uint8Array(await file.arrayBuffer());
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes("%PDF-")) throw new AppError("pdfInvalid");
  signal.throwIfAborted();

  // Lazy-load the reader and its same-origin worker only when a PDF is selected.
  const { getDocument, GlobalWorkerOptions, version } = await import("pdfjs-dist/build/pdf.mjs");
  signal.throwIfAborted();
  GlobalWorkerOptions.workerSrc = `/pdf-assets/pdf.worker-${version}.min.mjs`;
  const task = getDocument({ data, stopAtErrors: true, disableFontFace: true, useSystemFonts: false, useWasm: false, cMapUrl: "/pdf-assets/cmaps/", cMapPacked: true, standardFontDataUrl: "/pdf-assets/standard_fonts/", verbosity: 0 });
  let timedOut = false;
  const abort = () => { void task.destroy(); };
  const timer = setTimeout(() => { timedOut = true; abort(); }, 30_000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw new AppError("pdfTooManyPages");
    const pages: string[] = [];
    let length = 0;
    let emptyPages = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      signal.throwIfAborted();
      onProgress(number, pdf.numPages);
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").replace(/[ \t]+\n/g, "\n").trim();
      page.cleanup();
      if (!text) emptyPages++;
      const section = `[Page ${number}]\n${text}`;
      length += section.length + (pages.length ? 2 : 0);
      if (length > MAX_CONTEXT_CHARS) throw new AppError("pdfTooMuchText");
      pages.push(section);
    }
    if (emptyPages === pdf.numPages) throw new AppError("pdfNoText");
    return { name: file.name, pages: pdf.numPages, emptyPages, text: pages.join("\n\n") };
  } catch (error) {
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    if (timedOut) throw new AppError("pdfTimeout");
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.name === "PasswordException") throw new AppError("pdfProtected");
    throw new AppError("pdfInvalid");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}
