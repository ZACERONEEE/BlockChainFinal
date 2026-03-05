import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";

const CONTRACT_ADDRESS = "0x3793e242ca28F20007C5cfC7677e6382692f34b0";

const ABI = [
  "function checkIn(string studentId)",
  "function getCheckInCount(string studentId) view returns (uint256)",
  "event CheckedIn(string studentId, address student, uint256 timestamp)",
];

function shortAddr(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(h) {
  if (!h) return "";
  return `${h.slice(0, 10)}…${h.slice(-8)}`;
}

function copyToClipboard(text) {
  if (!text) return;
  navigator.clipboard?.writeText(text);
}

function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const tone =
    toast.type === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : toast.type === "error"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border-slate-500/30 bg-slate-500/10 text-slate-200";

  return (
    <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2">
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${tone}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.message ? <p className="text-xs opacity-90">{toast.message}</p> : null}
        </div>
        <button
          onClick={onClose}
          className="ml-2 rounded-lg px-2 py-1 text-xs opacity-80 hover:opacity-100"
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function App() {
  // theme
  const [theme, setTheme] = useState(() => localStorage.getItem("chaincheck_theme") || "dark");

  // web3
  const [account, setAccount] = useState("");
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [count, setCount] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastTx, setLastTx] = useState("");

  // UI extras
  const [toast, setToast] = useState(null);
  const [recent, setRecent] = useState([]);
  const statusRef = useRef(null);

  const hasMM = typeof window !== "undefined" && !!window.ethereum;

  const provider = useMemo(() => {
    if (!hasMM) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasMM]);

  // apply theme to <html class="dark">
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("chaincheck_theme", theme);
  }, [theme]);

  // load existing wallet connection
  useEffect(() => {
    if (!hasMM) return;

    window.ethereum.request({ method: "eth_accounts" }).then((acc) => {
      if (acc?.[0]) setAccount(acc[0]);
    });

    const handleAccounts = (acc) => setAccount(acc?.[0] || "");
    window.ethereum.on?.("accountsChanged", handleAccounts);

    return () => window.ethereum.removeListener?.("accountsChanged", handleAccounts);
  }, [hasMM]);

  function notify(type, title, message = "") {
    setToast({ type, title, message });
  }

  function pushRecent(item) {
    setRecent((prev) => [item, ...prev].slice(0, 6));
  }

  async function connectWallet() {
    if (!hasMM) {
      notify("error", "MetaMask not found", "Please install MetaMask to continue.");
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      notify("success", "Wallet connected", shortAddr(accounts[0]));
    } catch (e) {
      notify("error", "Connection cancelled", e?.message || "");
    }
  }

  async function checkIn() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!studentId.trim()) return notify("error", "Missing Student ID", "Please enter a Student ID.");

    try {
      setLoading(true);
      setStatus("Sending transaction…");

      const signer = await provider.getSigner();
      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);

      const tx = await contract.checkIn(studentId.trim());
      setLastTx(tx.hash);
      setStatus(`Waiting confirmation… ${shortHash(tx.hash)}`);
      pushRecent({ kind: "WRITE", label: `Check-in (${studentId.trim()})`, extra: shortHash(tx.hash) });

      await tx.wait();

      setStatus("Checked in ✅");
      notify("success", "Check-in recorded", `Student ID: ${studentId.trim()}`);
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed.";
      setStatus("Transaction failed.");
      notify("error", "Transaction failed", msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadCount() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!studentId.trim()) return notify("error", "Missing Student ID", "Please enter a Student ID.");

    try {
      setLoading(true);
      setStatus("Reading from blockchain…");

      const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
      const c = await contract.getCheckInCount(studentId.trim());
      setCount(Number(c));

      setStatus("Loaded ✅");
      pushRecent({ kind: "READ", label: `Count (${studentId.trim()})`, extra: `${Number(c)}` });
      notify("success", "Count loaded", `Total: ${Number(c)}`);
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Read failed.";
      setStatus("Read failed.");
      notify("error", "Read failed", msg);
    } finally {
      setLoading(false);
      statusRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }

  const bgBase =
    "min-h-screen transition-colors duration-300 " +
    "bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white";

  return (
    <div className={bgBase}>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Animated background glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div
          className="absolute -left-40 -top-40 h-[520px] w-[520px] rounded-full bg-indigo-500/20 blur-3xl dark:bg-indigo-400/20"
          style={{ animation: "glowMove 10s ease-in-out infinite" }}
        />
        <div
          className="absolute -right-44 top-32 h-[520px] w-[520px] rounded-full bg-cyan-500/20 blur-3xl dark:bg-cyan-400/20"
          style={{ animation: "glowMove 12s ease-in-out infinite" }}
        />
        <div
          className="absolute bottom-[-220px] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-400/10"
          style={{ animation: "floaty 6s ease-in-out infinite" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(99,102,241,0.12),transparent_40%),radial-gradient(circle_at_80%_20%,rgba(34,211,238,0.12),transparent_45%),radial-gradient(circle_at_50%_90%,rgba(16,185,129,0.08),transparent_45%)]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-10">
        {/* Top bar */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500 bg-clip-text text-transparent">
                ChainCheck
              </span>{" "}
              <span className="opacity-90">App</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Modern attendance logger (Ganache + MetaMask + Smart Contract)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
              title="Toggle theme"
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>

            {/* Wallet chip */}
            {account ? (
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/70 px-4 py-2 text-sm shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/10">
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                <span className="font-semibold">Connected:</span>
                <span className="font-mono">{shortAddr(account)}</span>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                Not connected
              </div>
            )}

            <button
              onClick={connectWallet}
              className="rounded-2xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 hover:opacity-95 active:opacity-90"
            >
              {account ? "Reconnect" : "Connect MetaMask"}
            </button>
          </div>
        </div>

        {/* Main card */}
        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Left: main actions */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">Attendance Console</h2>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Write a check-in (transaction) or read stored data (view).
                  </p>
                </div>
                <span className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                  Local dApp
                </span>
              </div>

              <div className="mt-5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Student ID
                </label>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g., 2023-0001"
                    className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500"
                  />

                  <button
                    onClick={checkIn}
                    disabled={loading}
                    className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Working…" : "Check In (write)"}
                  </button>

                  <button
                    onClick={loadCount}
                    disabled={loading}
                    className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-bold text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
                  >
                    Get Count (read)
                  </button>
                </div>
              </div>

              {/* Status */}
              <div ref={statusRef} className="mt-5 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="font-semibold">Status:</span>{" "}
                    <span className="text-slate-700 dark:text-slate-200">{status}</span>
                  </div>

                  {lastTx ? (
                    <div className="flex items-center gap-2">
                      <span className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                        TX: {shortHash(lastTx)}
                      </span>
                      <button
                        onClick={() => {
                          copyToClipboard(lastTx);
                          notify("success", "Copied", "Transaction hash copied.");
                        }}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                        title="Copy tx hash"
                      >
                        Copy
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Result */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Check-ins
                  </p>
                  <p className="mt-2 text-4xl font-extrabold">{count ?? "—"}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    for Student ID: <span className="font-mono">{studentId || "—"}</span>
                  </p>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Contract
                  </p>
                  <p className="mt-2 break-all font-mono text-sm text-slate-800 dark:text-slate-100">
                    {CONTRACT_ADDRESS}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        copyToClipboard(CONTRACT_ADDRESS);
                        notify("success", "Copied", "Contract address copied.");
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                    >
                      Copy address
                    </button>
                    <span className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                      Ganache • Chain ID 1337
                    </span>
                  </div>
                </div>
              </div>

              <p className="mt-5 text-xs text-slate-600 dark:text-slate-400">
                Tip: MetaMask must be set to Ganache (RPC: 127.0.0.1:7545, Chain ID: 1337).
              </p>
            </div>
          </div>

          {/* Right: Recent activity */}
          <div className="lg:col-span-1">
            <div className="rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5">
              <h3 className="text-lg font-bold">Recent Activity</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Quick history for your demo (local only).
              </p>

              <div className="mt-4 space-y-3">
                {recent.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/40 px-4 py-6 text-center text-sm text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-slate-300">
                    No activity yet.
                    <div className="mt-1 text-xs opacity-80">Try Check In or Get Count.</div>
                  </div>
                ) : (
                  recent.map((r, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={
                            "rounded-xl px-2 py-1 text-[11px] font-extrabold " +
                            (r.kind === "WRITE"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                              : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-200")
                          }
                        >
                          {r.kind}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{r.extra}</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {r.label}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setRecent([])}
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
              >
                Clear activity
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center text-xs text-slate-500 dark:text-slate-400">
          Built with Solidity • Hardhat • Ganache • MetaMask • React • ethers.js • Tailwind
        </div>
      </div>
    </div>
  );
}