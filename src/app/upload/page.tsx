"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  generateAccessibleDocxBlob,
  type AccessibleDocument,
} from "@/lib/generate-docx-client";

type Status =
  | "idle"
  | "uploading"
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
    setStatus("processing");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/process-syllabus", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          throw new Error(data.error || "Processing failed.");
        }
        throw new Error(`Server error (${res.status}). Please try again.`);
      }

      // res.text() automatically accumulates the entire streamed response.
      // The server streams AI tokens to keep the connection alive,
      // and the browser collects them all into one string.
      const rawText = await res.text();

      if (!rawText.trim()) {
        throw new Error("No document data received. Please try again.");
      }

      // Parse the AI's JSON response
      setStatus("generating");

      const cleaned = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      let documentData: AccessibleDocument;
      try {
        documentData = JSON.parse(cleaned);
      } catch {
        console.error(
          "JSON parse failed. First 500 chars:",
          cleaned.slice(0, 500)
        );
        throw new Error("AI returned invalid data. Please try again.");
      }

      // Generate DOCX in the browser
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

  const isProcessing = status === "processing" || status === "generating";

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-primary mb-2">
            Upload Your Syllabus
          </h1>
          <p className="text-muted text-sm">
            Upload a <strong>.docx</strong> or <strong>.pdf</strong> syllabus to
            generate an ADA-compliant version.
          </p>
        </div>

        {!isProcessing && (
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              isDragActive
                ? "border-accent bg-blue-50"
                : "border-border hover:border-accent hover:bg-blue-50/50"
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
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium text-primary">
                {status === "generating"
                  ? "Generating accessible document..."
                  : "Processing Accessibility Updates..."}
              </p>
              <p className="text-sm text-muted mt-1">
                Analyzing <strong>{fileName}</strong> for ADA compliance. This
                may take a moment.
              </p>
            </div>
          </div>
        )}

        {status === "done" && (
          <div className="mt-6 text-center bg-green-50 text-green-800 px-4 py-3 rounded-lg">
            <p className="font-medium">
              Your accessible syllabus has been downloaded.
            </p>
            <p className="text-sm mt-1">
              Upload another file above to convert again.
            </p>
          </div>
        )}

        {status === "error" && (
          <div
            role="alert"
            className="mt-6 text-center bg-red-50 text-red-700 px-4 py-3 rounded-lg"
          >
            <p className="font-medium">Something went wrong</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}
      </div>
    </main>
  );
}
