"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScanView } from "@/lib/scanner";
import { scanAction } from "./actions";

type Stats = { admitted: number; remaining: number; total: number };
type Recent = { id: string; result: string; at: string; code: string | null; holder: string | null; by: string }[];
type Shown = { kind: "view"; view: ScanView } | { kind: "offline" | "error"; message: string };

const LABEL: Record<string, string> = { ADMITTED: "Admitted", DUPLICATE: "Duplicate", WRONG_EVENT: "Wrong event", NOT_FOUND: "Not found", INVALID_STATUS: "Rejected" };

export function ScannerClient({ eventId, eventTitle, initialStats, initialRecent }: { eventId: string; eventTitle: string; initialStats: Stats; initialRecent: Recent }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const last = useRef({ value: "", at: 0 });
  const [shown, setShown] = useState<Shown | null>(null);
  const [stats, setStats] = useState(initialStats);
  const [recent, setRecent] = useState(initialRecent);
  const [pending, setPending] = useState(false);
  const [camError, setCamError] = useState("");
  const [manual, setManual] = useState("");

  const submit = useCallback(async (value: string) => {
    if (busy.current) return; // one validation at a time per device
    busy.current = true;
    setPending(true);
    try {
      const res = await scanAction(eventId, value);
      if (!res.ok) { setShown({ kind: "error", message: res.error }); return; }
      setShown({ kind: "view", view: res.view });
      setStats(res.stats);
      setRecent(res.recent);
      navigator.vibrate?.(res.view.outcome === "ADMITTED" ? 80 : [120, 60, 120]);
    } catch {
      // Never show an admission without a confirmed server response.
      setShown({ kind: "offline", message: "Cannot reach the server. Validation is unavailable. Do NOT admit until the connection is back." });
    } finally {
      busy.current = false;
      setPending(false);
    }
  }, [eventId]);

  useEffect(() => {
    let scanner: import("qr-scanner").default | null = null;
    let cancelled = false;
    (async () => {
      const QrScanner = (await import("qr-scanner")).default;
      if (cancelled || !videoRef.current) return;
      if (!(await QrScanner.hasCamera())) { setCamError("No camera found on this device. Use manual entry below."); return; }
      scanner = new QrScanner(
        videoRef.current,
        (result) => {
          const value = result.data;
          const now = Date.now();
          if (value === last.current.value && now - last.current.at < 3000) return; // same code held in view
          last.current = { value, at: now };
          void submit(value);
        },
        { returnDetailedScanResult: true, preferredCamera: "environment", highlightScanRegion: true, maxScansPerSecond: 4 },
      );
      try {
        await scanner.start();
      } catch (e) {
        const msg = String(e);
        setCamError(/NotAllowed|Permission/i.test(msg)
          ? "Camera access was blocked. Allow the camera for this site in your browser settings, then reload. You can still use manual entry."
          : "The camera could not be started. Use manual entry below.");
      }
    })();
    return () => { cancelled = true; scanner?.destroy(); };
  }, [submit]);

  const tone = shown?.kind === "view" ? (shown.view.outcome === "ADMITTED" ? "ok" : "bad") : shown ? "warn" : null;
  const toneClass = tone === "ok" ? "border-green-600 bg-green-50 text-green-900" : tone === "bad" ? "border-red-600 bg-red-50 text-red-900" : "border-amber-500 bg-amber-50 text-amber-900";

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="truncate text-lg font-semibold">{eventTitle}</h1>
        <p className="text-sm text-muted-foreground" aria-live="polite">{stats.admitted} admitted, {stats.remaining} remaining of {stats.total}</p>
      </div>

      <div className="overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
      </div>
      {camError && <p role="alert" className="text-sm text-destructive">{camError}</p>}

      {shown && (
        <div role="alert" aria-live="assertive" className={`flex items-start gap-3 rounded-lg border-2 p-4 ${toneClass}`}>
          {tone === "ok" ? <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0" aria-hidden /> : tone === "bad" ? <XCircle className="mt-0.5 h-8 w-8 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-8 w-8 shrink-0" aria-hidden />}
          <div className="min-w-0">
            {shown.kind === "view" ? (
              <>
                <p className="text-2xl font-bold">{shown.view.title}</p>
                <p className="text-sm">{shown.view.detail}</p>
                {shown.view.ticket && <p className="mt-1 font-mono text-xs">{shown.view.ticket.code}</p>}
              </>
            ) : (
              <>
                <p className="text-xl font-bold">{shown.kind === "offline" ? "Validation unavailable" : "Error"}</p>
                <p className="text-sm">{shown.message}</p>
              </>
            )}
          </div>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); if (manual.trim()) { void submit(manual); setManual(""); } }} className="flex gap-2">
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type ticket ID, e.g. 7K2M-QX9D-4HTB" aria-label="Ticket ID" autoCapitalize="characters" autoComplete="off" />
        <Button type="submit" disabled={pending || !manual.trim()}>{pending ? "..." : "Check"}</Button>
      </form>

      <section aria-labelledby="hist">
        <h2 id="hist" className="mb-2 text-sm font-semibold">Recent scans</h2>
        {recent.length === 0 ? <p className="text-sm text-muted-foreground">No scans yet.</p> : (
          <ul className="divide-y rounded-lg border text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 p-3">
                <span className="min-w-0 truncate">{r.holder ?? "Unknown"} <span className="font-mono text-xs text-muted-foreground">{r.code ?? ""}</span></span>
                <span className="shrink-0 text-xs"><span className={r.result === "ADMITTED" ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{LABEL[r.result] ?? r.result}</span> {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
