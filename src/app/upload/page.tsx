"use client";

import { useCallback, useState } from "react";
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

export default function UploadPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

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
          body: JSON.stringify({ text: extractedText }),
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
        throw new Error("Server processing failed. Please try again.");
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

      // Trigger download
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "accessible-syllabus.docx";
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 1,
    disabled: status !== "idle" && status !== "done" && status !== "error",
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
      <div className="w-full max-w-2xl bg-surface-card border border-border rounded-2xl p-8 glow-border">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary glow-text mb-2 tracking-wide">
            Upload Your Syllabus
          </h1>
          <p className="text-muted text-sm">
            Upload a <strong className="text-text">.docx</strong> or{" "}
            <strong className="text-text">.pdf</strong> syllabus to generate an
            ADA-compliant version.
          </p>
        </div>

        {!isProcessing && (
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
                  : "Drag & drop your syllabus here, or click to browse"}
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
                ADA compliance. This may take a moment.
              </p>
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="mt-6 text-center bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 px-4 py-3 rounded-lg">
            <p className="font-medium">
              Your accessible syllabus has been downloaded.
            </p>
            <p className="text-sm mt-1 text-emerald-400/80">
              Upload another file above to convert again.
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
      </div>
    </main>
  );
}
