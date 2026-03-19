"use client";

import { useCallback, useState, Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import mammoth from "mammoth";
import {
  generateAccessibleDocxBlob,
  type AccessibleDocument,
} from "@/lib/generate-docx-client";

type Status =
  | "idle"
  | "extracting"
  | "processing"
  | "generating"
  | "preview"
  | "done"
  | "error";

function ShareLink() {
  const [copied, setCopied] = useState(false);
  const shareUrl = "https://accessibility.esdesigns.org/?ref=your-name";
  return (
    <div className="flex gap-2 items-center">
      <code className="text-xs bg-surface px-2 py-1 rounded flex-1 truncate text-primary/70 border border-border">
        {shareUrl}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(shareUrl);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        className="text-xs text-primary border border-primary/30 px-2 py-1 rounded hover:bg-primary/10 transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function UploadPageInner() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [learnOpen, setLearnOpen] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDownloadName, setPendingDownloadName] = useState("");
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<{ name: string; ok: boolean }[]>([]);
  const [institution, setInstitution] = useState<string | null>(null);
  const [pilotCredits, setPilotCredits] = useState<number>(0);
  const [isPilot, setIsPilot] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Read pilot-credits display cookie on mount (non-httpOnly, JS-readable)
  // Cookie presence (even at 0) means this is a pilot session
  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)pilot-credits=(\d+)/);
    if (match !== null) {
      setIsPilot(true);
      setPilotCredits(parseInt(match[1], 10));
    }
  }, []);

  // Move focus to preview panel when it appears
  useEffect(() => {
    if (status === "preview" && previewRef.current) {
      previewRef.current.focus();
    }
  }, [status]);
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  async function processOneFile(file: File): Promise<{ blob: Blob; downloadName: string; changes: string[]; institution: string | null }> {
    // Step 1: Extract text in the BROWSER
    const arrayBuffer = await file.arrayBuffer();
    let extractedText: string;

    if (file.name.toLowerCase().endsWith(".docx")) {
      const result = await mammoth.extractRawText({ arrayBuffer });
      extractedText = result.value;
    } else if (file.name.toLowerCase().endsWith(".pdf")) {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        pages.push(
          content.items
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((item: any) => (item.str as string) || "")
            .join(" ")
        );
      }
      extractedText = pages.join("\n\n");
    } else {
      throw new Error("Unsupported file type. Please upload a .docx or .pdf.");
    }

    if (!extractedText.trim()) {
      throw new Error("Could not extract any text from the file.");
    }

    // Step 2: Send extracted text to the API
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let rawText: string;
    try {
      const res = await fetch("/api/process-syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: extractedText, fileName: file.name }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          throw new Error(data.error || "Processing failed.");
        }
        throw new Error(`Server error (${res.status}). Please try again.`);
      }

      rawText = await res.text();
    } catch (fetchErr) {
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        throw new Error("Request timed out. The document may be too large. Please try again.");
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!rawText.trim()) throw new Error("No document data received. Please try again.");
    if (rawText.includes("__ERROR__")) {
      const errDetail = rawText.split("__ERROR__:")[1]?.trim() || "Unknown error";
      throw new Error(`Server error: ${errDetail}`);
    }

    // Step 3: Parse JSON
    const firstBrace = rawText.indexOf("{");
    if (firstBrace === -1) throw new Error("AI did not return JSON. Response starts with: " + rawText.slice(0, 120));

    let depth = 0;
    let lastBrace = -1;
    let inString = false;
    let escaped = false;
    for (let i = firstBrace; i < rawText.length; i++) {
      const ch = rawText[i];
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") { depth--; if (depth === 0) { lastBrace = i; break; } }
    }

    if (lastBrace === -1) throw new Error("AI returned incomplete JSON (truncated). Response length: " + rawText.length + " chars.");

    const jsonString = rawText.slice(firstBrace, lastBrace + 1);
    let documentData: AccessibleDocument;
    try {
      documentData = JSON.parse(jsonString);
    } catch {
      throw new Error("AI returned malformed JSON. Length: " + jsonString.length + ". Starts with: " + jsonString.slice(0, 120));
    }

    // Step 4: Generate DOCX
    const blob = await generateAccessibleDocxBlob(documentData);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const safeName = baseName.replace(/\s+/g, "-");
    return {
      blob,
      downloadName: `${safeName}(accessible).docx`,
      changes: documentData.changes ?? [],
      institution: documentData.institution ?? null,
    };
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setError("");
    setBatchResults([]);

    const isBatch = acceptedFiles.length > 1;

    if (isBatch) {
      setBatchTotal(acceptedFiles.length);
      setBatchIndex(0);
      const results: { name: string; ok: boolean }[] = [];

      for (let i = 0; i < acceptedFiles.length; i++) {
        const file = acceptedFiles[i];
        setFileName(file.name);
        setBatchIndex(i);
        setStatus("extracting");

        try {
          setStatus("processing");
          const { blob, downloadName } = await processOneFile(file);
          setStatus("generating");
          // Trigger download immediately for each file in batch
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = downloadName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          refreshPilotCredits();
          results.push({ name: file.name, ok: true });
        } catch {
          results.push({ name: file.name, ok: false });
        }
      }

      setBatchResults(results);
      setStatus("done");
    } else {
      // Single file — use preview flow
      const file = acceptedFiles[0];
      setFileName(file.name);
      setStatus("extracting");

      try {
        setStatus("processing");
        const { blob, downloadName, changes: fileChanges, institution: detectedInstitution } = await processOneFile(file);
        setStatus("generating");
        setChanges(fileChanges);
        setInstitution(detectedInstitution);
        setPendingBlob(blob);
        setPendingDownloadName(downloadName);
        setStatus("preview");
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred.");
        setStatus("error");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function triggerDownload(blob: Blob, downloadName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function refreshPilotCredits() {
    const match = document.cookie.match(/(?:^|;\s*)pilot-credits=(\d+)/);
    if (match !== null) {
      setIsPilot(true);
      setPilotCredits(parseInt(match[1], 10));
    }
  }

  function handleDownload() {
    if (pendingBlob && pendingDownloadName) {
      triggerDownload(pendingBlob, pendingDownloadName);
      setPendingBlob(null);
      setPendingDownloadName("");
      refreshPilotCredits();
      setStatus("done");
    }
  }

  const trialDone = isDemo && status === "done";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/pdf": [".pdf"],
    },
    maxFiles: isDemo ? 1 : 5,
    disabled: (status !== "idle" && status !== "done" && status !== "error") || trialDone,
  });

  const isProcessing =
    status === "extracting" ||
    status === "processing" ||
    status === "generating";

  // Update page title so screen reader users know when conversion completes
  // (placed after isProcessing is defined)
  useEffect(() => {
    if (status === "preview") document.title = "Conversion Complete — Syllabus A11Y";
    else if (status === "done") document.title = "Downloaded — Syllabus A11Y";
    else if (status === "error") document.title = "Error — Syllabus A11Y";
    else if (isProcessing) document.title = "Processing… — Syllabus A11Y";
    else document.title = "Syllabus A11Y";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const statusMessage =
    batchTotal > 1
      ? `Processing ${batchIndex + 1} of ${batchTotal}: ${fileName}...`
      : status === "extracting"
        ? "Extracting text from document..."
        : status === "generating"
          ? "Generating accessible document..."
          : "Processing Accessibility Updates...";

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface-card focus:text-primary focus:border focus:border-primary focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
    <main id="main-content" tabIndex={-1} className="min-h-screen flex flex-col items-center justify-center p-4 outline-none">
      <div className="w-full max-w-2xl">
        {/* A11y scan bar header */}
        <div className="scan-bar bg-surface-elevated border border-primary/30 rounded-t-xl px-6 py-3 flex items-center justify-between">
          <span className="text-xs font-mono text-primary/80 tracking-widest uppercase">
            accessibility.esdesigns.org
          </span>
          <span className="text-primary font-bold tracking-widest text-sm uppercase glow-text">
            Syllabus A11Y
          </span>
        </div>

        {/* Screen reader live region — announces status changes */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {isProcessing ? statusMessage : ""}
          {status === "preview" ? "Conversion complete. Review the changes below and click Download." : ""}
          {status === "done" ? "Document downloaded successfully." : ""}
          {status === "error" ? `Error: ${error}` : ""}
        </div>

        {/* Main card */}
        <div className="bg-surface-card border border-t-0 border-border rounded-b-2xl p-8 glow-border">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-primary glow-text mb-1 tracking-wide">
              Upload Your Document
            </h1>
            <p className="text-muted text-sm">
              Upload a <strong className="text-text">.docx</strong> or{" "}
              <strong className="text-text">.pdf</strong> document to generate an
              ADA-compliant version.
            </p>
          </div>

          {/* Demo mode badge */}
          {isDemo && !trialDone && (
            <div className="mb-4 text-center text-xs bg-primary/10 border border-primary/30 text-primary px-3 py-2 rounded-lg">
              <span aria-hidden="true">✦ </span>Free Trial — 1 conversion included
            </div>
          )}

          {isPilot && (
            <div className="mb-4 text-center text-xs bg-primary/10 border border-primary/30 text-primary px-3 py-2 rounded-lg">
              <span aria-hidden="true">✦ </span>Pilot Access —{" "}
              {pilotCredits > 0
                ? <><strong>{pilotCredits}</strong> conversion{pilotCredits !== 1 ? "s" : ""} remaining</>
                : <span className="text-red-400">No conversions remaining — <a href="mailto:bwinchell@esdesigns.org" className="underline">contact us for full access</a></span>
              }
            </div>
          )}

          {!isProcessing && status !== "preview" && !trialDone && (
            <div
              {...getRootProps()}
              aria-label={`Upload zone. ${isDemo ? "Drop or click to select a .docx or .pdf file." : "Drop or click to select up to 5 .docx or .pdf files."}`}
              className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                isDragActive
                  ? "border-accent bg-primary/5 glow-border-active"
                  : "border-border hover:border-primary hover:bg-primary/5"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex flex-col items-center gap-3">
                <svg
                  className="w-12 h-12 text-muted"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                  />
                </svg>
                <p className="text-muted">
                  {isDragActive
                    ? "Drop the file here..."
                    : "Drag & drop your document here, or click to browse"}
                </p>
                <p className="text-xs text-muted">
                  Supported formats: .docx, .pdf{!isDemo && " — up to 5 files"}
                </p>
                <p className="text-xs text-muted/80 mt-1">
                  Keyboard users: press <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-xs font-mono">Enter</kbd> or <kbd className="px-1 py-0.5 bg-surface border border-border rounded text-xs font-mono">Space</kbd> to open file selector
                </p>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div
                className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"
                role="status"
                aria-label="Processing"
              />
              <div className="text-center">
                <p className="font-medium text-primary glow-text">
                  {statusMessage}
                </p>
                <p className="text-sm text-muted mt-1">
                  Analyzing <strong className="text-text">{fileName}</strong> for
                  ADA compliance. This may take up to two minutes.
                </p>
              </div>
            </div>
          )}

          {status === "preview" && (
            <div
              ref={previewRef}
              tabIndex={-1}
              className="mt-2 bg-surface-elevated border border-primary/30 rounded-xl p-5 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <p className="font-semibold text-primary glow-text mb-3 text-center">
                <span aria-hidden="true">✦ </span>Accessibility improvements made
              </p>
              {institution && (
                <p className="text-xs text-center text-muted mb-3">
                  Institution detected: <strong className="text-primary">{institution}</strong>
                </p>
              )}
              <ul className="space-y-1.5 mb-5">
                {changes.length > 0 ? changes.map((change, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-primary mt-0.5" aria-hidden="true">✓</span>
                    <span className="text-text/80">{change}</span>
                  </li>
                )) : (
                  <li className="text-sm text-muted">Document restructured for WCAG 2.2 compliance.</li>
                )}
              </ul>
              <button
                type="button"
                onClick={handleDownload}
                className="w-full bg-primary/10 border-2 border-primary text-primary hover:bg-primary/20 font-semibold py-3 px-4 rounded-lg transition-all duration-200 tracking-wide text-sm glow-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                Download Accessible Document
              </button>
            </div>
          )}

          {status === "done" && !trialDone && (
            <div className="mt-2 text-center bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg">
              {batchResults.length > 1 ? (
                <>
                  <p className="font-medium">
                    {batchResults.filter(r => r.ok).length} of {batchResults.length} documents converted successfully.
                  </p>
                  {batchResults.some(r => !r.ok) && (
                    <ul className="text-sm mt-2 text-red-400 text-left space-y-0.5">
                      {batchResults.filter(r => !r.ok).map(r => (
                        <li key={r.name}><span aria-hidden="true">✗ </span>{r.name} — failed</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-sm mt-2 text-primary/70">Upload more files above to convert again.</p>
                </>
              ) : (
                <>
                  <p className="font-medium">Your accessible document has been downloaded.</p>
                  <p className="text-sm mt-1 text-primary/70">Upload another file above to convert again.</p>
                </>
              )}
            </div>
          )}

          {trialDone && (
            <div className="text-center bg-primary/10 border border-primary/30 text-primary px-4 py-4 rounded-lg">
              <p className="font-semibold text-base">Trial complete!</p>
              <p className="text-sm mt-1 text-primary/70">
                Your accessible document has been downloaded.
              </p>
              <p className="text-sm mt-3 text-muted">
                Need to convert more documents?{" "}
                <a href="/" className="text-primary hover:underline">
                  Request access
                </a>{" "}
                or learn more at{" "}
                <a
                  href="https://esdesigns.org/#/ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  esdesigns.org
                </a>
                .
              </p>
            </div>
          )}

          {status === "error" && (
            <div
              role="alert"
              className="mt-6 text-center bg-red-950/40 border border-red-800/50 text-red-400 px-4 py-3 rounded-lg"
            >
              <p className="font-medium">Something went wrong</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          )}

          {/* Learn More accordion */}
          <div className="mt-6 border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setLearnOpen(!learnOpen)}
              aria-expanded={learnOpen}
              aria-controls="about-panel"
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
            >
              <span className="font-medium tracking-wide">About This Tool</span>
              <span className="text-xs" aria-hidden="true">{learnOpen ? "▲" : "▼"}</span>
            </button>
            {learnOpen && (
              <div id="about-panel" className="px-4 pb-4 border-t border-border text-sm text-muted space-y-4">
                <div className="pt-3">
                  <div className="flex gap-2 items-start bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-3">
                    <span className="text-primary mt-0.5">🔒</span>
                    <p className="text-xs text-primary/80 leading-relaxed">
                      <strong>Private &amp; secure.</strong> Your documents are processed in memory and never stored. No document data, file contents, or personal information is retained after conversion.
                    </p>
                  </div>
                  <p className="text-text/80 text-xs leading-relaxed mb-3">
                    Upload a PDF or DOCX and receive a fully WCAG 2.2-compliant, properly
                    structured Word document ready for assistive technology.
                  </p>
                  <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                    How It Works
                  </h2>
                  <ol className="space-y-1 text-xs list-decimal list-inside">
                    <li>Upload a PDF or DOCX document</li>
                    <li>AI analyzes and restructures for accessibility compliance</li>
                    <li>Download a fully compliant, tagged Word document</li>
                  </ol>
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                    AI Capabilities
                  </h2>
                  <ul className="space-y-1 text-xs">
                    {[
                      "Enforces semantic heading hierarchy (H1→H2→H3)",
                      "Rewrites vague links into descriptive hyperlinks",
                      "Converts content into proper numbered and bulleted lists",
                      "Formats tables with proper header rows for screen readers",
                      "Sets document language metadata for assistive technology",
                      "Inserts missing accessibility accommodation statements for syllabi",
                      "Preserves all original content — restructures without removing",
                    ].map((cap) => (
                      <li key={cap} className="flex gap-2">
                        <span className="text-primary mt-0.5" aria-hidden="true">✓</span>
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="pt-2 border-t border-border">
                  <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                    Share This Tool
                  </h2>
                  <p className="text-xs text-muted mb-2">Send colleagues a direct link to try it free:</p>
                  <ShareLink />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted/80 mt-4">
          A tool by{" "}
          <a
            href="https://esdesigns.org"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="esdesigns.org (opens in new tab)"
            className="text-primary/80 hover:text-primary transition-colors"
          >
            esdesigns.org
          </a>
        </p>
      </div>
    </main>
    </>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageInner />
    </Suspense>
  );
}
