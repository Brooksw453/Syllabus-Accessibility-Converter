"use client";

import { useState, FormEvent, Suspense } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";

const RAINBOW_CHECKS = [
  "text-violet-600 dark:text-violet-400",
  "text-pink-600 dark:text-pink-400",
  "text-orange-600 dark:text-orange-400",
  "text-cyan-600 dark:text-cyan-400",
];

function LoginPageInner() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!emailValid) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        router.push("/upload");
      } else {
        const data = await res.json();
        setError(data.error || "Something went wrong.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const emailValid = email.trim().length > 0 && email.includes("@");

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface-card focus:text-primary focus:border focus:border-primary focus:px-3 focus:py-1.5 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <ThemeToggle />
      <main
        id="main-content"
        tabIndex={-1}
        className="bg-gradient-page min-h-screen flex flex-col items-center justify-center p-4 outline-none"
      >
        <div className="w-full max-w-md">
          {/* Logo / brand area above card */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/20 mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-1 tracking-wide">
              Document Ally
            </h1>
            <p className="text-blue-100 dark:text-slate-400 text-sm">
              AI-powered document accessibility converter
            </p>
          </div>

          {/* Card with gradient border */}
          <div className="card-gradient-border card-shadow">
            <div className="card-inner p-8">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-semibold text-text mb-1.5"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                    autoComplete="email"
                    className="w-full px-4 py-3 bg-surface-elevated border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary placeholder-muted/70 dark:placeholder-slate-500 text-sm"
                    placeholder="your@email.edu"
                  />
                </div>

                {error && (
                  <div
                    role="alert"
                    className="text-red-700 dark:text-red-400 text-sm bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 px-3 py-2 rounded-lg"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !emailValid}
                  className="w-full bg-primary text-white hover:bg-primary-dark font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed tracking-wide text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                >
                  {loading ? "Signing in..." : "Get Started"}
                </button>
                {!emailValid && (
                  <p className="text-xs text-muted text-center">
                    Enter your email to continue
                  </p>
                )}
              </form>

              <div className="mt-4 text-center text-xs text-muted">
                10 free document conversions per hour
              </div>

              {/* Learn More accordion */}
              <div className="mt-4 border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLearnOpen(!learnOpen)}
                  aria-expanded={learnOpen}
                  aria-controls="learn-more-panel"
                  className="w-full flex items-center justify-between px-4 py-3 text-sm text-text hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                >
                  <span className="font-medium tracking-wide">Learn More</span>
                  <span className="text-xs" aria-hidden="true">
                    {learnOpen ? "\u25B2" : "\u25BC"}
                  </span>
                </button>
                {learnOpen && (
                  <div
                    id="learn-more-panel"
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
                        <p className="text-xs text-primary dark:text-blue-300 leading-relaxed">
                          <strong>Private &amp; secure.</strong> Your documents
                          are processed in memory and never stored. No document
                          data, file contents, or personal information is
                          retained after conversion.
                        </p>
                      </div>
                      <p className="text-text text-xs leading-relaxed mb-3">
                        Upload a PDF or DOCX document and receive a fully WCAG
                        2.2-compliant, properly structured Word document ready
                        for assistive technology.
                      </p>
                      <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                        How It Works
                      </h2>
                      <ol className="space-y-1 text-xs list-decimal list-inside text-text">
                        <li>Upload a PDF or DOCX document</li>
                        <li>AI analyzes and restructures for accessibility</li>
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
                          "Inserts missing accessibility accommodation statements",
                          "Preserves all original content \u2014 restructures without removing",
                        ].map((cap, i) => (
                          <li key={cap} className="flex gap-2">
                            <span
                              className={`mt-0.5 ${RAINBOW_CHECKS[i % RAINBOW_CHECKS.length]}`}
                              aria-hidden="true"
                            >
                              &#10003;
                            </span>
                            <span className="text-text">
                              {cap}
                            </span>
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
