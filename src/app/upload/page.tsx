"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

type Status = "idle" | "uploading" | "extracting" | "processing" | "generating" | "done" | "error";

const STATUS_MESSAGES: Record<string, string> = {
  uploading: "Uploading file...",
  extracting: "Extracting text from document...",
  processing: "Processing Accessibility Updates...",
  generating: "Generating accessible document...",
};

export default function UploadPage() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setFileName(file.name);
    setError("");
    setStatus("uploading");

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

      // Read the streaming response line by line
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream.");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);

          if (event.status === "error") {
            throw new Error(event.error || "Processing failed.");
          }

          if (event.status === "extracting" || event.status === "processing" || event.status === "generating") {
            setStatus(event.status as Status);
          }

          if (event.status === "complete" && event.file) {
            // Decode base64 and trigger download
            const binaryString = atob(event.file);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const blob = new Blob([bytes], {
              type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "accessible-syllabus.docx";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setStatus("done");
          }
        }
      }

      // Process any remaining data in buffer
      if (buffer.trim()) {
        const event = JSON.parse(buffer);
        if (event.status === "error") {
          throw new Error(event.error || "Processing failed.");
        }
        if (event.status === "complete" && event.file) {
          const binaryString = atob(event.file);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "accessible-syllabus.docx";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setStatus("done");
        }
      }
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
    disabled: status === "uploading" || status === "extracting" || status === "processing" || status === "generating",
  });

  const isProcessing = status === "uploading" || status === "extracting" || status === "processing" || status === "generating";
  const statusMessage = STATUS_MESSAGES[status] || "Processing...";

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

        {/* Dropzone */}
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

        {/* Processing State */}
        {isProcessing && (
          <div className="flex flex-col items-center gap-4 py-12">
            <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="font-medium text-primary">
                {statusMessage}
              </p>
              <p className="text-sm text-muted mt-1">
                Analyzing <strong>{fileName}</strong> for ADA compliance. This
                may take a moment.
              </p>
            </div>
          </div>
        )}

        {/* Success State */}
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

        {/* Error State */}
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
