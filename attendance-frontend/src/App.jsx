import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";

// ✅ Replace with your NEW Sepolia deployed contract address
const CONTRACT_ADDRESS = "0xd45B520Bc4183f8fC48b21de5f43D987ef568De5";

// ✅ ABI for UPDATED Attendance.sol
const ABI = [
  "function checkIn(string studentId)",
  "function getCheckInCount(string studentId) view returns (uint256)",
  "function hasCheckedIn(string studentId) view returns (bool)",
  "function getTotalCheckIns() view returns (uint256)",
  "function getAllCheckIns() view returns (string[] ids, address[] students, uint256[] timestamps)",
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
        : toast.type === "warn"
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-slate-500/30 bg-slate-500/10 text-slate-200";

  return (
    <div className="fixed left-1/2 top-6 z-50 -translate-x-1/2">
      <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur ${tone}`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.message ? <p className="text-xs opacity-90">{toast.message}</p> : null}
        </div>
        <button onClick={onClose} className="ml-2 rounded-lg px-2 py-1 text-xs opacity-80 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("chaincheck_theme") || "dark");

  const [account, setAccount] = useState("");
  const [studentId, setStudentId] = useState("");
  const [status, setStatus] = useState("Ready.");
  const [count, setCount] = useState(null);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastTx, setLastTx] = useState("");
  const [toast, setToast] = useState(null);

  const [records, setRecords] = useState([]); // [{studentId, student, timestamp}]
  const statusRef = useRef(null);

  const hasMM = typeof window !== "undefined" && !!window.ethereum;

  const provider = useMemo(() => {
    if (!hasMM) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasMM]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("chaincheck_theme", theme);
  }, [theme]);

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

  function etherscanBase() {
    return "https://sepolia.etherscan.io";
  }

  async function connectWallet() {
    if (!hasMM) return notify("error", "MetaMask not found", "Please install MetaMask.");

    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setAccount(accounts[0]);
      notify("success", "Wallet connected", shortAddr(accounts[0]));
    } catch (e) {
      notify("error", "Connection cancelled", e?.message || "");
    }
  }

  async function ensureSepolia() {
    if (!hasMM) return false;
    const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
    if (chainIdHex !== "0xaa36a7") {
      notify("warn", "Wrong network", "Switch MetaMask to Sepolia Test Network.");
      return false;
    }
    return true;
  }

  async function getContractRead() {
    if (!provider) throw new Error("MetaMask provider not found");
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  }

  async function getContractWrite() {
    if (!provider) throw new Error("MetaMask provider not found");
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  }

  async function refreshAll() {
    if (!provider) return;
    try {
      if (!(await ensureSepolia())) return;

      const c = await getContractRead();
      const t = await c.getTotalCheckIns();
      setTotal(Number(t));

      const [ids, students, timestamps] = await c.getAllCheckIns();
      const rows = ids.map((id, i) => ({
        studentId: id,
        student: students[i],
        timestamp: Number(timestamps[i]),
      }));
      // newest first
      rows.reverse();
      setRecords(rows);
    } catch {
      // silent
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, account]);

  async function checkIn() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!(await ensureSepolia())) return;
    if (!studentId.trim()) return notify("error", "Missing Student ID", "Enter a Student ID.");

    try {
      setLoading(true);
      setStatus("Checking duplicate…");

      const cRead = await getContractRead();
      const already = await cRead.hasCheckedIn(studentId.trim());
      if (already) {
        setStatus("Already checked in.");
        notify("warn", "Duplicate blocked", "This Student ID already checked in.");
        return;
      }

      setStatus("Sending transaction…");
      const cWrite = await getContractWrite();
      const tx = await cWrite.checkIn(studentId.trim());

      setLastTx(tx.hash);
      setStatus(`Waiting confirmation… ${shortHash(tx.hash)}`);

      await tx.wait();

      setStatus("Checked in ✅");
      notify("success", "Check-in recorded", `Student ID: ${studentId.trim()}`);
      setStudentId("");

      await refreshAll();
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed.";
      setStatus(msg);
      notify("error", "Transaction failed", msg);
    } finally {
      setLoading(false);
    }
  }

  async function loadCount() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!(await ensureSepolia())) return;
    if (!studentId.trim()) return notify("error", "Missing Student ID", "Enter a Student ID.");

    try {
      setLoading(true);
      setStatus("Reading from blockchain…");

      const c = await getContractRead();
      const v = await c.getCheckInCount(studentId.trim());
      setCount(Number(v));

      setStatus("Loaded ✅");
      notify("success", "Count loaded", `Result: ${Number(v)} (0 or 1)`);
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Read failed.";
      setStatus(msg);
      notify("error", "Read failed", msg);
    } finally {
      setLoading(false);
      statusRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }

  function exportCSV() {
    if (!records.length) {
      notify("warn", "No data", "No attendance records to export.");
      return;
    }

    const header = ["StudentID", "WalletAddress", "Timestamp(Unix)", "Timestamp(Local)"];
    const lines = records
      .slice()
      .reverse() // export oldest->newest
      .map((r) => {
        const local = new Date(r.timestamp * 1000).toLocaleString();
        return [r.studentId, r.student, String(r.timestamp), local]
          .map((x) => `"${String(x).replaceAll('"', '""')}"`)
          .join(",");
      });

    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "chaincheck_attendance.csv";
    a.click();

    URL.revokeObjectURL(url);
    notify("success", "Exported", "Downloaded chaincheck_attendance.csv");
  }

  const bgBase =
    "min-h-screen transition-colors duration-300 " +
    "bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-white";

  return (
    <div className={bgBase}>
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="relative mx-auto max-w-6xl px-5 py-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              <span className="bg-gradient-to-r from-indigo-500 via-cyan-500 to-emerald-500 bg-clip-text text-transparent">
                ChainCheck
              </span>{" "}
              <span className="opacity-90">App</span>
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Attendance logger (Sepolia + MetaMask + Smart Contract)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
            >
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>

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

        {/* Console */}
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-white/5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Attendance Console</h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Duplicate check-ins are blocked (Student ID can only check in once).
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={refreshAll}
                className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-xs font-semibold hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
              >
                Refresh
              </button>

              <button
                onClick={exportCSV}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                Export CSV
              </button>
            </div>
          </div>

          <div className="mt-5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Student ID</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g., 2023-0001"
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500"
              />

              <button
                onClick={checkIn}
                disabled={loading || !account}
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
          <div
            ref={statusRef}
            className="mt-5 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <span className="font-semibold">Status:</span>{" "}
                <span className="text-slate-700 dark:text-slate-200 break-words">{status}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {lastTx ? (
                  <>
                    <span className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200">
                      TX: {shortHash(lastTx)}
                    </span>
                    <button
                      onClick={() => copyToClipboard(lastTx)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                    >
                      Copy TX
                    </button>
                    <a
                      href={`${etherscanBase()}/tx/${lastTx}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-500"
                    >
                      View TX
                    </a>
                  </>
                ) : null}

                <a
                  href={`${etherscanBase()}/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                >
                  View Contract
                </a>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                This Student
              </p>
              <p className="mt-2 text-4xl font-extrabold">{count ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                <span className="font-semibold"></span> 
              </p>
              <p className="mt-2 text-2xl font-bold">
                {count === null
                  ? "—"
                  : count === 1
                  ? "Already checked in"
                  : "Not checked in yet"}
              </p>

              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Duplicate attendance is automatically blocked
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Total Check-ins
              </p>
              <p className="mt-2 text-4xl font-extrabold">{total ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">All students on-chain</p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Contract
              </p>
              <p className="mt-2 break-all font-mono text-xs text-slate-800 dark:text-slate-100">
                {CONTRACT_ADDRESS}
              </p>
              <button
                onClick={() => copyToClipboard(CONTRACT_ADDRESS)}
                className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
              >
                Copy address
              </button>
            </div>
          </div>

          {/* Records table */}
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold">Attendance Records (On-chain)</h3>
              <span className="text-xs text-slate-600 dark:text-slate-300">Newest first</span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-3">Student ID</th>
                    <th className="py-2 pr-3">Wallet</th>
                    <th className="py-2 pr-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-4 text-slate-600 dark:text-slate-300">
                        No records yet.
                      </td>
                    </tr>
                  ) : (
                    records.map((r, i) => (
                      <tr key={i} className="border-t border-slate-200/60 dark:border-white/10">
                        <td className="py-3 pr-3 font-mono">{r.studentId}</td>
                        <td className="py-3 pr-3 font-mono">
                          {shortAddr(r.student)}{" "}
                          <button
                            className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] dark:border-white/10 dark:bg-white/10"
                            onClick={() => copyToClipboard(r.student)}
                          >
                            Copy
                          </button>
                        </td>
                        <td className="py-3 pr-3">
                          {new Date(r.timestamp * 1000).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
            MetaMask must be on <span className="font-semibold">Sepolia</span> (Chain ID: 11155111).
          </p>
        </div>

        <div className="mt-10 text-center text-xs text-slate-500 dark:text-slate-400">
          Built with Solidity • Hardhat • Sepolia • MetaMask • React • ethers.js • Tailwind
        </div>
      </div>
    </div>
  );
}