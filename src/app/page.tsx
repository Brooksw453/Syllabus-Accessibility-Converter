"use client";

import { useState, FormEvent, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginPageInner() {
  const [email, setEmail] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [learnOpen, setLearnOpen] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("trial") === "used") {
      setError("Your free trial has been used. Enter your access code to continue.");
    }
  }, [searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: accessCode }),
      });
      if (res.ok) {
        router.push("/upload");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid access code.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleTryFree() {
    if (!email.trim()) return;
    setDemoLoading(true);
    setError("");
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          router.push(data.redirect);
        }
      } else {
        const data = await res.json();
        setError(data.error || "Could not start free trial. Please try again.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDemoLoading(false);
    }
  }

  const emailValid = email.trim().length > 0 && email.includes("@");
  const ref = searchParams.get("ref");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* A11Y scan bar header */}
        <div className="scan-bar bg-surface-elevated border border-primary/30 rounded-t-xl px-6 py-3 flex items-center justify-between mb-0">
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
              Syllabus A11Y
            </h1>
            <p className="text-muted text-sm">
              AI-powered accessibility converter for course documents.
            </p>
          </div>

          {/* Referral badge */}
          {ref && (
            <div className="mb-4 text-xs text-center text-primary/70 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
              Referred by <strong className="text-primary">{ref}</strong>
            </div>
          )}

          {/* Email — shared by both Try It Free and Sign In */}
          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-xs font-medium text-muted mb-1 tracking-wide uppercase"
            >
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary placeholder-muted/50 text-sm"
              placeholder="your@email.com"
            />
          </div>

          {/* Try It Free button */}
          <button
            type="button"
            onClick={handleTryFree}
            disabled={demoLoading || !emailValid}
            className="w-full bg-primary/10 border-2 border-primary text-primary hover:bg-primary/20 font-semibold py-3 px-4 rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed tracking-wide text-sm mb-4 glow-border"
          >
            {demoLoading ? "Starting trial..." : "✦ Try It Free — 1 Free Conversion"}
          </button>
          {!emailValid && (
            <p className="text-xs text-muted/60 text-center -mt-3 mb-4">
              Enter your email above to try it free
            </p>
          )}

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted">or sign in</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="access-code"
                className="block text-xs font-medium text-muted mb-1 tracking-wide uppercase"
              >
                Access Code
              </label>
              <input
                id="access-code"
                type="password"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary placeholder-muted/50 text-sm"
                placeholder="Enter access code"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="text-red-400 text-sm bg-red-950/40 border border-red-800/50 px-3 py-2 rounded-lg"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full border border-border text-muted hover:border-primary hover:text-primary font-medium py-2.5 px-4 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed tracking-wide text-sm"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </form>

          {/* Institution access contact */}
          <div className="mt-4 text-center text-xs text-muted/70 bg-surface-elevated border border-border rounded-lg px-4 py-3">
            Want access for your school or institution?{" "}
            <a
              href="mailto:bwinchell@esdesigns.org"
              className="text-primary hover:underline"
            >
              bwinchell@esdesigns.org
            </a>
          </div>

          {/* Learn More accordion */}
          <div className="mt-4 border border-border rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setLearnOpen(!learnOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-sm text-muted hover:text-primary transition-colors"
            >
              <span className="font-medium tracking-wide">Learn More</span>
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
                    Upload a PDF or DOCX syllabus and receive a fully WCAG 2.2-compliant,
                    properly structured Word document ready for assistive technology.
                  </p>
                  <h2 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">
                    How It Works
                  </h2>
                  <ol className="space-y-1 text-xs list-decimal list-inside">
                    <li>Upload a PDF or DOCX syllabus</li>
                    <li>AI analyzes and restructures for accessibility</li>
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
                      "Inserts missing accessibility accommodation statements",
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageInner />
    </Suspense>
  );
}
