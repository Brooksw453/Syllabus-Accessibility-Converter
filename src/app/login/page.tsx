"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dark, setDark] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("da-theme", next ? "dark" : "light");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      router.push("/upload");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={toggleTheme}
        className="theme-toggle"
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      >
        {dark ? "\u2600\uFE0F" : "\uD83C\uDF19"}
      </button>

      <main className="bg-gradient-page min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="card-gradient-border card-shadow">
            <div className="card-inner p-8">
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-primary mb-1 tracking-wide">
                  Document Ally
                </h1>
                <p className="text-muted text-sm">
                  AI-powered document accessibility converter
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-text mb-1.5"
                  >
                    Email address
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-2.5 rounded-lg border border-border bg-surface-elevated text-text placeholder-muted text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                    autoFocus
                  />
                  <p className="mt-1.5 text-xs text-muted">
                    Used for usage tracking only. No password required.
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 px-3 py-2 rounded-lg"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white hover:bg-primary-dark font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 tracking-wide text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  {loading ? "Signing in..." : "Continue"}
                </button>
              </form>
            </div>
          </div>

          <p className="text-center text-xs text-white/90 dark:text-slate-300 mt-4">
            A tool by{" "}
            <a
              href="https://esdesigns.org"
              target="_blank"
              rel="noopener noreferrer"
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
