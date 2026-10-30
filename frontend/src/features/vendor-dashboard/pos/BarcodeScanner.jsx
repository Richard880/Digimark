import { useEffect, useRef, useState } from "react";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"];

export default function BarcodeScanner({ onCode, onClose, continuous = true, status = null, title = "Scan a barcode" }) {
  const video = useRef(null);
  const [err, setErr] = useState("");
  const [last, setLast] = useState("");
  const [typed, setTyped] = useState("");
  const cb = useRef(onCode); cb.current = onCode;
  const closeRef = useRef(onClose); closeRef.current = onClose;

  useEffect(() => {
    let stream, controls, raf, stop = false;
    const seen = { code: "", at: 0 };
    const emit = (raw) => {
      const code = String(raw || "").trim();
      const now = Date.now();
      if (!code || (code === seen.code && now - seen.at < 1500)) return; // the same label is read many times a second
      seen.code = code; seen.at = now;
      navigator.vibrate?.(60);
      setLast(code);
      cb.current(code);
      if (!continuous) closeRef.current();
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setErr("The camera isn't available in this browser. Use a keyboard scanner or type the code.");
      try {
        if ("BarcodeDetector" in window) {
          let formats = FORMATS;
          try { const ok = await window.BarcodeDetector.getSupportedFormats(); formats = FORMATS.filter((f) => ok.includes(f)); } catch { /* use the full list */ }
          const det = new window.BarcodeDetector({ formats });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
          if (stop) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.current.srcObject = stream;
          await video.current.play();
          let busy = false, lastRun = 0;
          const tick = async (t) => {
            if (stop) return;
            if (!busy && t - lastRun > 150 && video.current?.readyState >= 2) {
              busy = true; lastRun = t;
              try { const r = await det.detect(video.current); if (r[0]?.rawValue) emit(r[0].rawValue); } catch { /* a frame that can't be read */ }
              busy = false;
            }
            raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        } else {
          const { BrowserMultiFormatReader } = await import("@zxing/browser"); // loaded only here, so it never slows the rest of the app
          const reader = new BrowserMultiFormatReader();
          controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current, (result) => { if (result) emit(result.getText()); });
          if (stop) controls.stop();
        }
      } catch (e) {
        setErr(e?.name === "NotAllowedError" ? "Camera access was blocked. Allow the camera for Sokodigi in your browser's site settings."
          : e?.name === "NotFoundError" ? "No camera was found on this device." : "Couldn't start the camera. You can type the code instead.");
      }
    })();

    const onKey = (e) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => { stop = true; cancelAnimationFrame(raf); controls?.stop?.(); stream?.getTracks().forEach((t) => t.stop()); window.removeEventListener("keydown", onKey); };
  }, [continuous]);

  const submitTyped = (e) => { e.preventDefault(); const c = typed.trim(); if (c) { cb.current(c); setLast(c); setTyped(""); if (!continuous) closeRef.current(); } };

  return (
    <div className="fixed inset-0 z-[3200] flex flex-col bg-slate-900" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <p className="text-sm font-black">{title}</p>
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl bg-white px-4 text-xs font-black text-slate-900">{continuous ? "Done" : "Cancel"}</button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-2xl border-2 border-emerald-400/80" />
        {err && <p role="alert" className="absolute inset-x-4 top-4 rounded-xl bg-red-600 px-4 py-3 text-xs font-bold text-white">{err}</p>}
      </div>
      <div className="space-y-2 bg-white p-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
        {status && <p role="status" className={`rounded-xl px-3 py-2 text-xs font-bold ${status.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{status.t}</p>}
        {!status && last && <p className="text-xs text-slate-500">Last scanned: <b className="font-mono">{last}</b></p>}
        <form onSubmit={submitTyped} className="flex gap-2">
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type the code" aria-label="Type the barcode" maxLength={32}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-base focus:border-emerald-500 focus:outline-none" />
          <button type="submit" className="shrink-0 rounded-xl bg-slate-900 px-4 text-xs font-bold text-white">Use</button>
        </form>
      </div>
    </div>
  );
}
