"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import * as XLSX from "xlsx";

interface UsageEvent {
  email: string;
  fileName: string;
  timestamp: string;
}

export default function AdminPage() {
  const [log, setLog] = useState<UsageEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  useEffect(() => {
    document.title = "Admin Dashboard \u2014 Document Ally";

    fetch("/api/admin/usage")
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) {
          router.push("/");
          return;
        }
        if (!res.ok) throw new Error("Failed to load usage data");
        const data = await res.json();
        setLog(data.log ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [router]);

  const uniqueUsers = new Set(log.map((e) => e.email)).size;
  const totalConversions = log.length;

  function handleExportExcel() {
    const rows = log.map((event) => ({
      Email: event.email,
      File: event.fileName,
      Timestamp: new Date(event.timestamp).toLocaleString(),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // Auto-size columns
    ws["!cols"] = [
      { wch: 30 }, // Email
      { wch: 40 }, // File
      { wch: 22 }, // Timestamp
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Usage History");
    XLSX.writeFile(wb, `document-ally-usage-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

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
        className="bg-gradient-page min-h-screen flex flex-col items-center p-4 pt-16 outline-none"
      >
        <div className="w-full max-w-4xl">
          {/* Header */}
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
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-white mb-1 tracking-wide">
              Admin Dashboard
            </h1>
            <p className="text-blue-100 dark:text-slate-400 text-sm">
              Document Ally &mdash; Usage History
            </p>
          </div>

          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="card-gradient-border card-shadow">
              <div className="card-inner p-5 text-center">
                <p className="text-3xl font-bold text-primary">
                  {totalConversions}
                </p>
                <p className="text-sm text-muted mt-1">Total Conversions</p>
              </div>
            </div>
            <div className="card-gradient-border card-shadow">
              <div className="card-inner p-5 text-center">
                <p className="text-3xl font-bold text-primary">
                  {uniqueUsers}
                </p>
                <p className="text-sm text-muted mt-1">Unique Users</p>
              </div>
            </div>
          </div>

          {/* Usage log table */}
          <div className="card-gradient-border card-shadow">
            <div className="card-inner p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-primary">
                  Usage History
                </h2>
                {log.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="inline-flex items-center gap-1.5 bg-primary text-white hover:bg-primary-dark text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export Excel
                  </button>
                )}
              </div>

              {loading && (
                <div className="flex justify-center py-12">
                  <div
                    className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"
                    role="status"
                    aria-label="Loading"
                  />
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg text-sm"
                >
                  {error}
                </div>
              )}

              {!loading && !error && log.length === 0 && (
                <p className="text-muted text-sm text-center py-8">
                  No conversions yet. Usage will appear here as users convert
                  documents.
                </p>
              )}

              {!loading && !error && log.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th
                          scope="col"
                          className="text-left py-2 pr-4 font-semibold text-text"
                        >
                          Email
                        </th>
                        <th
                          scope="col"
                          className="text-left py-2 pr-4 font-semibold text-text"
                        >
                          File
                        </th>
                        <th
                          scope="col"
                          className="text-left py-2 font-semibold text-text"
                        >
                          Time
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {log.map((event, i) => (
                        <tr
                          key={i}
                          className="border-b border-border/50 last:border-0"
                        >
                          <td className="py-2.5 pr-4 text-text">{event.email}</td>
                          <td className="py-2.5 pr-4 text-muted truncate max-w-[200px]">
                            {event.fileName}
                          </td>
                          <td className="py-2.5 text-muted whitespace-nowrap">
                            {new Date(event.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Back link */}
          <p className="text-center mt-6">
            <a
              href="/upload"
              className="text-white dark:text-blue-300 text-sm underline underline-offset-2 hover:text-blue-100 dark:hover:text-blue-200 transition-colors"
            >
              &larr; Back to converter
            </a>
          </p>

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
