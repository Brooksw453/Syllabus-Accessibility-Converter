"use client";

import { useCallback, useState, Suspense } from "react";
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
  | "done"
  | "error";

function UploadPageInner() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [learnOpen, setLearnOpen] = useState(false);
  const searchParams = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    setError("");

    try {
      // Step 1: Extract text in the BROWSER (no server needed)
      setStatus("extracting");
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

      // Step 2: Send extracted TEXT (not the file) to the API
      setStatus("processing");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

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

      if (!rawText.trim()) {
        throw new Error("No document data received. Please try again.");
      }

      if (rawText.includes("__ERROR__")) {
        const errDetail = rawText.split("__ERROR__:")[1]?.trim() || "Unknown error";
        throw new Error(`Server error: ${errDetail}`);
      }

      // Step 3: Parse JSON and generate DOCX in the browser
      setStatus("generating");

      // Extract JSON: find outermost { } using brace matching
      const firstBrace = rawText.indexOf("{");
      if (firstBrace === -1) {
        throw new Error(
          "AI did not return JSON. Response starts with: " +
            rawText.slice(0, 120)
        );
      }

      // Walk from firstBrace, counting braces to find the matching close
      let depth = 0;
      let lastBrace = -1;
      let inString = false;
      let escaped = false;
      for (let i = firstBrace; i < rawText.length; i++) {
        const ch = rawText[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "{") depth++;
        if (ch === "}") {
          depth--;
          if (depth === 0) {
            lastBrace = i;
            break;
          }
        }
      }

      if (lastBrace === -1) {
        throw new Error(
          "AI returned incomplete JSON (truncated). Response length: " +
            rawText.length +
            " chars. Starts with: " +
            rawText.slice(0, 120)
        );
      }

      const jsonString = rawText.slice(firstBrace, lastBrace + 1);

      let documentData: AccessibleDocument;
      try {
        documentData = JSON.parse(jsonString);
      } catch {
        throw new Error(
          "AI returned malformed JSON. Length: " +
            jsonString.length +
            ". Starts with: " +
            jsonString.slice(0, 120)
        );
      }

      // Step 4: Generate DOCX in the browser
      const blob = await generateAccessibleDocxBlob(documentData);

      // Trigger download — derive filename from original: spaces→hyphens, strip ext, append (accessible)
      // Use file.name directly (avoids stale closure on fileName state)
      const baseName = file.name.replace(/\.[^/.]+$/, ""); // strip extension
      const safeName = baseName.replace(/\s+/g, "-");      // spaces → hyphens
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}(accessible).docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred.");
      setStatus("error");
    }
  }, []);

  const trialDone = isDemo && status === "done";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    disabled: (status !== "idle" && status !== "done" && status !== "error") || trialDone,
  });

  const isProcessing =
    status === "extracting" ||
    status === "processing" ||
    status === "generating";

  const statusMessage =
    status === "extracting"
      ? "Extracting text from document..."
      : status === "generating"
        ? "Generating accessible document..."
        : "Processing Accessibility Updates...";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* A11y scan bar header */}
        <div className="scan-bar bg-surface-elevated border border-primary/30 rounded-t-xl px-6 py-3 flex items-center justify-between">
          <span className="text-xs font-mono text-primary/60 tracking-widest uppercase">
            accessibility.esdesigns.org
          </span>
          <span className="text-primary font-bold tracking-widest text-sm uppercase glow-text">
            Syllabus A11Y
          </span>
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
              ✦ Free Trial — 1 conversion included
            </div>
          )}

          {!isProcessing && !trialDone && (
            <div
              {...getRootProps()}
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
                  Supported formats: .docx, .pdf
                </p>
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
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

          {status === "done" && !trialDone && (
            <div className="mt-2 text-center bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg">
              <p className="font-medium">Your accessible document has been downloaded.</p>
              <p className="text-sm mt-1 text-primary/70">Upload another file above to convert again.</p>
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
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted hover:text-primary transition-colors"
            >
              <span className="font-medium tracking-wide">About This Tool</span>
              <span className="text-xs">{learnOpen ? "▲" : "▼"}</span>
            </button>
            {learnOpen && (
              <div className="px-4 pb-4 border-t border-border text-sm text-muted space-y-4">
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
                        <span className="text-primary mt-0.5">✓</span>
                        <span>{cap}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted/50 mt-4">
          A tool by{" "}
          <a
            href="https://esdesigns.org"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary/60 hover:text-primary transition-colors"
          >
            esdesigns.org
          </a>
        </p>
      </div>
    </main>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageInner />
    </Suspense>
  );
}
