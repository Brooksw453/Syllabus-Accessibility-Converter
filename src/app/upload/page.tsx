"use client";

import { useCallback, useState, Suspense, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import mammoth from "mammoth";
import {
  generateAccessibleDocxBlob,
  type AccessibleDocument,
  type FontOption,
  type ImageData,
  type ImageDimensions,
} from "@/lib/generate-docx-client";

const RAINBOW_CHECKS = [
  "text-violet-600 dark:text-violet-400",
  "text-pink-600 dark:text-pink-400",
  "text-orange-600 dark:text-orange-400",
  "text-cyan-600 dark:text-cyan-400",
];

/** Inline theme toggle for the status bar (no fixed positioning) */
function ThemeToggleInline() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("da-theme", next ? "dark" : "light");
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="w-7 h-7 rounded-full flex items-center justify-center bg-white/15 hover:bg-white/25 border border-white/20 transition-all text-sm shrink-0"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
    </button>
  );
}

/** Floating theme toggle (same as ThemeToggle component, used when status bar isn't visible) */
function FloatingThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("da-theme", next ? "dark" : "light");
  }
  return (
    <button
      type="button"
      onClick={toggle}
      className="theme-toggle"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
    </button>
  );
}

interface ExtractedImage {
  id: string;
  base64: string;
  contentType: string;
  originalArrayBuffer: ArrayBuffer;
  width: number;
  height: number;
}

/** Compress an image for API transmission using browser canvas */
async function compressImageForApi(
  base64: string,
  contentType: string,
  maxDimension = 1024,
  quality = 0.7
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(dataUrl.split(",")[1]);
    };
    img.onerror = () => resolve(base64); // fallback to original
    img.src = `data:${contentType};base64,${base64}`;
  });
}

type Status =
  | "idle"
  | "extracting"
  | "processing"
  | "generating"
  | "preview"
  | "done"
  | "error";

interface UserStatus {
  email: string;
  admin: boolean;
  remaining: number | null;
  resetInSeconds: number | null;
}

function UploadPageInner() {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [learnOpen, setLearnOpen] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDocData, setPendingDocData] = useState<AccessibleDocument | null>(null);
  const [pendingDownloadName, setPendingDownloadName] = useState("");
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchIndex, setBatchIndex] = useState(0);
  const [batchResults, setBatchResults] = useState<
    { name: string; ok: boolean }[]
  >([]);
  const [institution, setInstitution] = useState<string | null>(null);
  const [selectedFont, setSelectedFont] = useState<FontOption>("Calibri");
  const [userStatus, setUserStatus] = useState<UserStatus | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Move focus to preview panel when it appears
  useEffect(() => {
    if (status === "preview" && previewRef.current) {
      previewRef.current.focus();
    }
  }, [status]);

  // Fetch user status (email, admin, remaining docs, reset time)
  function refreshUserStatus() {
    fetch("/api/user/status")
      .then(async (res) => {
        if (!res.ok) return;
        const data: UserStatus = await res.json();
        setUserStatus(data);
        if (data.resetInSeconds != null && data.remaining != null && data.remaining < 10) {
          setCountdown(data.resetInSeconds);
        } else {
          setCountdown(null);
        }
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshUserStatus();
  }, []);

  // Refresh status after each conversion
  useEffect(() => {
    if (status === "preview" || status === "done") {
      refreshUserStatus();
    }
  }, [status]);

  // Countdown timer
  useEffect(() => {
    if (countdown == null || countdown <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev == null || prev <= 1) {
          refreshUserStatus();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [countdown]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  async function processOneFile(
    file: File,
    font?: FontOption
  ): Promise<{
    blob: Blob;
    downloadName: string;
    changes: string[];
    institution: string | null;
    documentData: AccessibleDocument;
  }> {
    const arrayBuffer = await file.arrayBuffer();
    let extractedText: string;
    const extractedImages: ExtractedImage[] = [];

    if (file.name.toLowerCase().endsWith(".docx")) {
      let imageCounter = 0;
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            imageCounter++;
            const id = `IMAGE_${imageCounter}`;
            const contentType = image.contentType;
            const base64 = await image.readAsBase64String();
            const ab = await image.readAsArrayBuffer();
            // Get natural dimensions
            let width = 576;
            let height = 432;
            try {
              const bitmap = await createImageBitmap(
                new Blob([ab], { type: contentType })
              );
              width = bitmap.width;
              height = bitmap.height;
              bitmap.close();
            } catch {
              // use defaults
            }
            extractedImages.push({ id, base64, contentType, originalArrayBuffer: ab, width, height });
            return { src: `__PLACEHOLDER_${id}__` };
          }),
        }
      );
      // Convert HTML to plain text with image placeholders
      let html = result.value;
      html = html.replace(
        /<img[^>]*src="__PLACEHOLDER_(IMAGE_\d+)__"[^>]*>/gi,
        "[$1]"
      );
      html = html.replace(/<br\s*\/?>/gi, "\n");
      html = html.replace(/<\/p>/gi, "\n\n");
      html = html.replace(/<\/?(h[1-6]|div|li|tr|td|th)[^>]*>/gi, "\n");
      html = html.replace(/<[^>]+>/g, "");
      html = html.replace(/&nbsp;/g, " ");
      html = html.replace(/&amp;/g, "&");
      html = html.replace(/&lt;/g, "<");
      html = html.replace(/&gt;/g, ">");
      html = html.replace(/&quot;/g, '"');
      html = html.replace(/&#39;/g, "'");
      html = html.replace(/\n{3,}/g, "\n\n");
      extractedText = html.trim();
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

    // Compress images for API transmission
    let apiImages: { id: string; base64: string; contentType: string }[] | undefined;
    if (extractedImages.length > 0) {
      const compressed = await Promise.all(
        extractedImages.map(async (img) => ({
          id: img.id,
          base64: await compressImageForApi(img.base64, img.contentType),
          contentType: "image/jpeg",
        }))
      );
      // Check total payload size (4MB safe limit for Vercel Hobby)
      const totalSize =
        extractedText.length +
        compressed.reduce((sum, img) => sum + img.base64.length, 0);
      if (totalSize < 4_000_000) {
        apiImages = compressed;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    let rawText: string;
    try {
      const res = await fetch("/api/process-syllabus", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: extractedText,
          fileName: file.name,
          images: apiImages,
        }),
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
      if (
        fetchErr instanceof DOMException &&
        fetchErr.name === "AbortError"
      ) {
        throw new Error(
          "Request timed out. The document may be too large. Please try again."
        );
      }
      throw fetchErr;
    } finally {
      clearTimeout(timeout);
    }

    if (!rawText.trim())
      throw new Error("No document data received. Please try again.");
    if (rawText.includes("__ERROR__")) {
      const errDetail =
        rawText.split("__ERROR__:")[1]?.trim() || "Unknown error";
      throw new Error(`Server error: ${errDetail}`);
    }

    const firstBrace = rawText.indexOf("{");
    if (firstBrace === -1)
      throw new Error(
        "AI did not return JSON. Response starts with: " +
          rawText.slice(0, 120)
      );

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

    if (lastBrace === -1)
      throw new Error(
        "AI returned incomplete JSON (truncated). Response length: " +
          rawText.length +
          " chars."
      );

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

    // Build images map and dimensions for DOCX generation
    if (extractedImages.length > 0) {
      const imagesMap: Record<string, ImageData> = {};
      const dimsMap: Record<string, ImageDimensions> = {};
      const MAX_WIDTH = 576; // 6 inches at 96 DPI
      for (const img of extractedImages) {
        imagesMap[img.id] = { data: img.originalArrayBuffer, contentType: img.contentType };
        let w = img.width;
        let h = img.height;
        if (w > MAX_WIDTH) {
          const scale = MAX_WIDTH / w;
          w = MAX_WIDTH;
          h = Math.round(h * scale);
        }
        dimsMap[img.id] = { width: w, height: h };
      }
      documentData.images = imagesMap;
      // Store dimensions for blob generation
      (documentData as AccessibleDocument & { _dims?: Record<string, ImageDimensions> })._dims = dimsMap;
    }

    const dims = (documentData as AccessibleDocument & { _dims?: Record<string, ImageDimensions> })._dims;
    const blob = await generateAccessibleDocxBlob(documentData, font, dims);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const safeName = baseName.replace(/\s+/g, "-");
    return {
      blob,
      downloadName: `${safeName}(accessible).docx`,
      changes: documentData.changes ?? [],
      institution: documentData.institution ?? null,
      documentData,
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
          const { blob, downloadName } = await processOneFile(file, selectedFont);
          setStatus("generating");
          triggerDownload(blob, downloadName);
          results.push({ name: file.name, ok: true });
        } catch {
          results.push({ name: file.name, ok: false });
        }
      }

      setBatchResults(results);
      setStatus("done");
    } else {
      const file = acceptedFiles[0];
      setFileName(file.name);
      setStatus("extracting");

      try {
        setStatus("processing");
        const {
          blob,
          downloadName,
          changes: fileChanges,
          institution: detectedInstitution,
          documentData,
        } = await processOneFile(file, selectedFont);
        setStatus("generating");
        setChanges(fileChanges);
        setInstitution(detectedInstitution);
        setPendingBlob(blob);
        setPendingDocData(documentData);
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

  async function handleDownload() {
    if (pendingDownloadName && (pendingBlob || pendingDocData)) {
      // Regenerate blob with the currently selected font
      const dims = pendingDocData
        ? (pendingDocData as AccessibleDocument & { _dims?: Record<string, ImageDimensions> })._dims
        : undefined;
      const blob = pendingDocData
        ? await generateAccessibleDocxBlob(pendingDocData, selectedFont, dims)
        : pendingBlob!;
      triggerDownload(blob, pendingDownloadName);
      setPendingBlob(null);
      setPendingDocData(null);
      setPendingDownloadName("");
      setStatus("done");
    }
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
      "application/pdf": [".pdf"],
    },
    maxFiles: 5,
    disabled:
      status !== "idle" && status !== "done" && status !== "error",
  });

  const isProcessing =
    status === "extracting" ||
    status === "processing" ||
    status === "generating";

  useEffect(() => {
    if (status === "preview")
      document.title = "Conversion Complete \u2014 Document Ally";
    else if (status === "done")
      document.title = "Downloaded \u2014 Document Ally";
    else if (status === "error")
      document.title = "Error \u2014 Document Ally";
    else if (isProcessing)
      document.title = "Processing\u2026 \u2014 Document Ally";
    else document.title = "Document Ally";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const statusMessage =
    batchTotal > 1
      ? `Processing ${batchIndex + 1} of ${batchTotal}: ${fileName}...`
      : status === "extracting"
        ? "Extracting text and images from document..."
        : status === "generating"
          ? "Generating accessible document..."
          : "Processing Accessibility Updates...";

  function formatCountdown(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface-card focus:text-primary focus:border focus:border-primary focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      {/* Top bar with user info, theme toggle, remaining docs, logout */}
      {userStatus && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-black/20 backdrop-blur-sm border-b border-white/10">
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-y-1 text-xs text-white">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="opacity-80 truncate max-w-[160px] sm:max-w-none">{userStatus.email}</span>
              {userStatus.admin && (
                <a
                  href="/admin"
                  className="bg-violet-500/80 hover:bg-violet-500 text-white px-2 py-0.5 rounded font-semibold transition-colors shrink-0"
                >
                  Admin
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              {userStatus.remaining != null && !userStatus.admin && (
                <span className="opacity-80 hidden sm:inline">
                  {userStatus.remaining} remaining
                  {countdown != null && countdown > 0 && (
                    <span className="ml-1 text-amber-300">
                      ({formatCountdown(countdown)})
                    </span>
                  )}
                </span>
              )}
              {userStatus.remaining != null && !userStatus.admin && (
                <span className="opacity-80 sm:hidden">
                  {userStatus.remaining} left
                </span>
              )}
              {userStatus.admin && (
                <span className="text-amber-300 font-semibold">Unlimited</span>
              )}
              <ThemeToggleInline />
              <button
                type="button"
                onClick={handleLogout}
                className="text-white/70 hover:text-white transition-colors underline underline-offset-2"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Show floating theme toggle only when status bar isn't visible yet */}
      {!userStatus && <FloatingThemeToggle />}

      <main
        id="main-content"
        tabIndex={-1}
        className="bg-gradient-page min-h-screen flex flex-col items-center justify-center p-4 pt-14 outline-none"
      >
        <div className="w-full max-w-2xl">
          {/* Screen reader live region */}
          <div aria-live="polite" aria-atomic="true" className="sr-only">
            {isProcessing ? statusMessage : ""}
            {status === "preview"
              ? "Conversion complete. Review the changes below and click Download."
              : ""}
            {status === "done" ? "Document downloaded successfully." : ""}
            {status === "error" ? `Error: ${error}` : ""}
          </div>

          {/* Main card with gradient border */}
          <div className="card-gradient-border card-shadow">
            <div className="card-inner p-8">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-primary mb-1 tracking-wide">
                  Upload Your Document
                </h1>
                <p className="text-muted text-sm">
                  Upload a <strong className="text-primary font-bold">.docx</strong> or{" "}
                  <strong className="text-primary font-bold">.pdf</strong> document to
                  generate an ADA-compliant version.
                </p>
              </div>

              {!isProcessing && status !== "preview" && (
                <div
                  {...getRootProps()}
                  aria-label="Upload zone. Drop or click to select up to 5 .docx or .pdf files."
                  className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-200 ${
                    isDragActive
                      ? "border-primary bg-primary/10 shadow-md"
                      : "border-border hover:border-primary hover:bg-primary/5"
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="flex flex-col items-center gap-3">
                    <svg
                      className="w-12 h-12 text-primary"
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
                    <p className="text-text font-medium">
                      {isDragActive
                        ? "Drop the file here..."
                        : "Drag & drop your document here, or click to browse"}
                    </p>
                    <p className="text-xs text-muted">
                      Supported formats: .docx, .pdf &mdash; up to 5 files
                    </p>
                    <p className="text-xs text-muted mt-1">
                      Keyboard users: press{" "}
                      <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded text-xs font-mono text-text">
                        Enter
                      </kbd>{" "}
                      or{" "}
                      <kbd className="px-1 py-0.5 bg-surface-elevated border border-border rounded text-xs font-mono text-text">
                        Space
                      </kbd>{" "}
                      to open file selector
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
                    <p className="font-medium text-primary">{statusMessage}</p>
                    <p className="text-sm text-text mt-1">
                      Analyzing{" "}
                      <strong className="text-primary">{fileName}</strong> for
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
                  <p className="font-semibold text-primary mb-3 text-center">
                    Accessibility improvements made
                  </p>
                  {institution && (
                    <p className="text-xs text-center text-muted mb-3">
                      Institution detected:{" "}
                      <strong className="text-primary">{institution}</strong>
                    </p>
                  )}
                  <ul className="space-y-1.5 mb-5">
                    {changes.length > 0 ? (
                      changes.map((change, i) => (
                        <li key={i} className="flex gap-2 text-sm">
                          <span
                            className={`mt-0.5 ${RAINBOW_CHECKS[i % RAINBOW_CHECKS.length]}`}
                            aria-hidden="true"
                          >
                            &#10003;
                          </span>
                          <span className="text-text">{change}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-sm text-text">
                        Document restructured for WCAG 2.2 compliance.
                      </li>
                    )}
                  </ul>
                  <div className="mb-3">
                    <label
                      htmlFor="font-select"
                      className="block text-xs font-medium text-muted mb-1"
                    >
                      Document font
                    </label>
                    <select
                      id="font-select"
                      value={selectedFont}
                      onChange={(e) =>
                        setSelectedFont(e.target.value as FontOption)
                      }
                      className="w-full rounded-lg border border-primary/30 bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="Calibri">Calibri (recommended)</option>
                      <option value="Arial">Arial</option>
                      <option value="Times New Roman">Times New Roman</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="w-full bg-primary text-white hover:bg-primary-dark font-semibold py-3 px-4 rounded-lg transition-all duration-200 tracking-wide text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                  >
                    Download Accessible Document
                  </button>
                </div>
              )}

              {status === "done" && (
                <div className="mt-2 text-center bg-primary/10 border border-primary/30 text-primary px-4 py-3 rounded-lg">
                  {batchResults.length > 1 ? (
                    <>
                      <p className="font-medium">
                        {batchResults.filter((r) => r.ok).length} of{" "}
                        {batchResults.length} documents converted successfully.
                      </p>
                      {batchResults.some((r) => !r.ok) && (
                        <ul className="text-sm mt-2 text-red-600 dark:text-red-400 text-left space-y-0.5">
                          {batchResults
                            .filter((r) => !r.ok)
                            .map((r) => (
                              <li key={r.name}>
                                <span aria-hidden="true">&#10007; </span>
                                {r.name} &mdash; failed
                              </li>
                            ))}
                        </ul>
                      )}
                      <p className="text-sm mt-2 text-primary">
                        Upload more files above to convert again.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium">
                        Your accessible document has been downloaded.
                      </p>
                      <p className="text-sm mt-1 text-primary">
                        Upload another file above to convert again.
                      </p>
                    </>
                  )}
                </div>
              )}

              {status === "error" && (
                <div
                  role="alert"
                  className="mt-6 text-center bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg"
                >
                  <p className="font-medium">Something went wrong</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              )}

              {/* About This Tool accordion */}
              <div className="mt-6 border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLearnOpen(!learnOpen)}
                  aria-expanded={learnOpen}
                  aria-controls="about-panel"
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-text hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  <span className="font-medium tracking-wide">
                    About This Tool
                  </span>
                  <span className="text-xs" aria-hidden="true">
                    {learnOpen ? "\u25B2" : "\u25BC"}
                  </span>
                </button>
                {learnOpen && (
                  <div
                    id="about-panel"
                    className="px-4 pb-4 border-t border-border text-sm space-y-4"
                  >
                    <div className="pt-3">
                      <div className="flex gap-2 items-start bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 mb-3">
                        <span
                          className="text-primary mt-0.5"
                          aria-hidden="true"
                        >
                          &#128274;
                        </span>
                        <p className="text-xs text-primary leading-relaxed">
                          <strong>Private &amp; secure.</strong> Your documents
                          are processed in memory and never stored. No document
                          data, file contents, or personal information is
                          retained after conversion.
                        </p>
                      </div>
                      <p className="text-text text-xs leading-relaxed mb-3">
                        Upload a PDF or DOCX and receive a fully WCAG
                        2.2-compliant, properly structured Word document ready
                        for assistive technology.
                      </p>
                      <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                        How It Works
                      </h2>
                      <ol className="space-y-1 text-xs list-decimal list-inside text-text">
                        <li>Upload a PDF or DOCX document</li>
                        <li>
                          AI analyzes and restructures for accessibility
                          compliance
                        </li>
                        <li>
                          Download a fully compliant, tagged Word document
                        </li>
                      </ol>
                    </div>
                    <div>
                      <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                        AI Capabilities
                      </h2>
                      <ul className="space-y-1 text-xs">
                        {[
                          "Enforces semantic heading hierarchy (H1\u2192H2\u2192H3)",
                          "Rewrites vague links into descriptive hyperlinks",
                          "Converts content into proper numbered and bulleted lists",
                          "Formats tables with proper header rows for screen readers",
                          "Sets document language metadata for assistive technology",
                          "Inserts missing accessibility accommodation statements for syllabi",
                          "Preserves all original content \u2014 restructures without removing",
                        ].map((cap, i) => (
                          <li key={cap} className="flex gap-2">
                            <span
                              className={`mt-0.5 ${RAINBOW_CHECKS[i % RAINBOW_CHECKS.length]}`}
                              aria-hidden="true"
                            >
                              &#10003;
                            </span>
                            <span className="text-text">{cap}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-white/90 dark:text-slate-300 mt-4">
            A tool by{" "}
            <a
              href="https://esdesigns.org"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="esdesigns.org (opens in new tab)"
              className="text-white dark:text-blue-300 hover:text-blue-100 dark:hover:text-blue-200 transition-colors underline underline-offset-2"
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
