import { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";

// ✅ sessions contract deployed on Sepolia
const CONTRACT_ADDRESS = "0x5d3c7097f23fcc8633a4DE03a7479E1A95588504";

// ✅ ABI for sessions + teacher-only startSession
const ABI = [
  "function admin() view returns (address)",
  "function currentSessionId() view returns (uint256)",
  "function startSession()",
  "function checkIn(string studentId)",
  "function getSessionCount(uint256 sessionId) view returns (uint256)",
  "function hasCheckedIn(uint256 sessionId, string studentId) view returns (bool)",
  "event SessionStarted(uint256 sessionId, address admin, uint256 timestamp)",
  "event CheckedIn(uint256 sessionId, string studentId, address student, uint256 timestamp)",
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

  // wallet
  const [account, setAccount] = useState("");

  // contract info
  const [adminAddr, setAdminAddr] = useState("");
  const [currentSessionId, setCurrentSessionId] = useState(0);
  const [sessionCount, setSessionCount] = useState(null);

  // student form
  const [studentId, setStudentId] = useState("");
  const [hasChecked, setHasChecked] = useState(null);

  // status
  const [status, setStatus] = useState("Ready.");
  const [loading, setLoading] = useState(false);
  const [lastTx, setLastTx] = useState("");
  const [toast, setToast] = useState(null);
  const statusRef = useRef(null);

  const hasMM = typeof window !== "undefined" && !!window.ethereum;

  const provider = useMemo(() => {
    if (!hasMM) return null;
    return new ethers.BrowserProvider(window.ethereum);
  }, [hasMM]);

  function notify(type, title, message = "") {
    setToast({ type, title, message });
  }

  function etherscanBase() {
    return "https://sepolia.etherscan.io";
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

  async function getContractRead() {
    if (!provider) throw new Error("No provider");
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
  }

  async function getContractWrite() {
    if (!provider) throw new Error("No provider");
    const signer = await provider.getSigner();
    return new ethers.Contract(CONTRACT_ADDRESS, ABI, signer);
  }

  async function refreshInfo() {
    if (!provider) return;
    try {
      if (!(await ensureSepolia())) return;

      const c = await getContractRead();
      const a = await c.admin();
      const sid = await c.currentSessionId();

      setAdminAddr(a);
      setCurrentSessionId(Number(sid));

      if (Number(sid) > 0) {
        const cnt = await c.getSessionCount(sid);
        setSessionCount(Number(cnt));
      } else {
        setSessionCount(null);
      }
    } catch {
      // silent
    }
  }

  // theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("chaincheck_theme", theme);
  }, [theme]);

  // listen wallet changes
  useEffect(() => {
    if (!hasMM) return;

    const handleAccounts = (acc) => setAccount(acc?.[0] || "");
    const handleChain = () => window.location.reload();

    window.ethereum.request({ method: "eth_accounts" }).then(handleAccounts);

    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged", handleChain);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccounts);
      window.ethereum.removeListener("chainChanged", handleChain);
    };
  }, [hasMM]);

  // refresh when account/provider changes
  useEffect(() => {
    refreshInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, provider]);

  const isTeacher =
    adminAddr && account && adminAddr.toLowerCase() === account.toLowerCase();

  async function startSession() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!(await ensureSepolia())) return;

    try {
      setLoading(true);
      setStatus("Starting new session…");

      const c = await getContractWrite();
      const tx = await c.startSession();

      setLastTx(tx.hash);
      setStatus(`Waiting confirmation… ${shortHash(tx.hash)}`);

      await tx.wait();

      setStatus("Session started ✅");
      notify("success", "Session started", "Teacher started a new class session.");
      await refreshInfo();
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Start session failed.";
      setStatus(msg);
      notify("error", "Start session failed", msg);
    } finally {
      setLoading(false);
    }
  }

  async function checkIn() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!(await ensureSepolia())) return;
    if (!studentId.trim()) return notify("error", "Missing Student ID", "Enter a Student ID.");

    try {
      setLoading(true);
      setStatus("Preparing check-in…");

      const cRead = await getContractRead();
      const sid = await cRead.currentSessionId();
      const sidNum = Number(sid);

      if (sidNum === 0) {
        setStatus("Session not started.");
        notify("warn", "Session not started", "Teacher must click Start Session first.");
        return;
      }

      const already = await cRead.hasCheckedIn(sid, studentId.trim());
      setHasChecked(already);

      if (already) {
        setStatus("Already checked in for this session.");
        notify("warn", "Duplicate blocked", "Student already checked in this session.");
        return;
      }

      setStatus("Sending transaction…");
      const cWrite = await getContractWrite();
      const tx = await cWrite.checkIn(studentId.trim());

      setLastTx(tx.hash);
      setStatus(`Waiting confirmation… ${shortHash(tx.hash)}`);

      await tx.wait();

      setStatus("Checked in ✅");
      notify("success", "Check-in recorded", `Session ${sidNum}: ${studentId.trim()}`);
      setStudentId("");
      setHasChecked(null);

      await refreshInfo();
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed.";
      setStatus(msg);
      notify("error", "Transaction failed", msg);
    } finally {
      setLoading(false);
      statusRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }

  async function loadSessionCount() {
    if (!provider) return notify("error", "MetaMask not found");
    if (!(await ensureSepolia())) return;

    try {
      setLoading(true);
      setStatus("Reading session count…");

      const c = await getContractRead();
      const sid = await c.currentSessionId();
      const sidNum = Number(sid);

      if (sidNum === 0) {
        setStatus("Session not started.");
        notify("warn", "Session not started", "Teacher must click Start Session first.");
        return;
      }

      const cnt = await c.getSessionCount(sid);
      setSessionCount(Number(cnt));

      setStatus("Loaded ✅");
      notify("success", "Loaded", `Session ${sidNum} total: ${Number(cnt)}`);
    } catch (e) {
      const msg = e?.shortMessage || e?.reason || e?.message || "Read failed.";
      setStatus(msg);
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
              Choice A: MetaMask login • Teacher starts session • Students check-in
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
          {/* Session info */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Teacher (Admin)</p>
              <p className="mt-1 font-mono text-xs break-all">{adminAddr || "—"}</p>
              <p className="mt-1 text-xs">
                {account ? (isTeacher ? "You are the teacher ✅" : "You are a student") : "Connect wallet"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Current Session</p>
              <p className="mt-1 text-3xl font-extrabold">{currentSessionId || 0}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {currentSessionId > 0 ? "Session active" : "Not started"}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-sm shadow-sm dark:border-white/10 dark:bg-white/5">
              <p className="text-xs text-slate-500 dark:text-slate-400">Session Count</p>
              <p className="mt-1 text-3xl font-extrabold">{sessionCount ?? "—"}</p>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Check-ins in current session</p>
            </div>
          </div>

          {/* Teacher action */}
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              onClick={startSession}
              disabled={loading || !account || !isTeacher}
              className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Working…" : "Start Session (Teacher Only)"}
            </button>

            <button
              onClick={loadSessionCount}
              disabled={loading}
              className="rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-bold text-slate-800 shadow-sm hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15"
            >
              Get Session Count (read)
            </button>
          </div>

          {/* Student action */}
          <div className="mt-6">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">Student ID</label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g., 2023-0001"
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:border-white/10 dark:bg-black/20 dark:text-white dark:placeholder:text-slate-500"
              />

              <button
                onClick={checkIn}
                disabled={loading || !account}
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Working…" : "Check In"}
              </button>
            </div>

            {hasChecked !== null ? (
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                Has checked in this session: <span className="font-semibold">{String(hasChecked)}</span>
              </p>
            ) : null}
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

                <button
                  onClick={() => {
                    copyToClipboard(CONTRACT_ADDRESS);
                    notify("success", "Copied", "Contract address copied.");
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1 text-xs font-semibold hover:bg-slate-50 dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15"
                >
                  Copy Address
                </button>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">
            Teacher starts a session → students check in once per session → teacher can start a new session anytime.
          </p>
        </div>

        <div className="mt-10 text-center text-xs text-slate-500 dark:text-slate-400">
          Built with Solidity • Hardhat • Sepolia • MetaMask • React • ethers.js • Tailwind
        </div>
      </div>
    </div>
  );
}