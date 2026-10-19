import { useEffect } from "react";

export default function AvatarMenuModal({ isOpen, onClose, currentImageUrl, onUploadClick, isOwnProfile }) {
  // Hooks stay above the early return
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const hasImage = typeof currentImageUrl === "string" && currentImageUrl.startsWith("https://");
  const row = "w-full py-3.5 text-sm font-bold hover:bg-slate-50 transition block border-none bg-transparent cursor-pointer";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div role="dialog" aria-modal="true" aria-label="Profile picture options"
        className="relative bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl border border-slate-100 text-center">
        <div className="py-2 divide-y divide-slate-100">
          {hasImage ? (
            <button type="button" className={`${row} text-slate-800`}
              onClick={() => { window.open(currentImageUrl, "_blank", "noopener,noreferrer"); onClose(); }}>
              View Profile Picture
            </button>
          ) : (
            <p className="py-3.5 text-xs font-semibold text-slate-400">No profile picture yet.</p>
          )}

          {isOwnProfile && (
            <button type="button" className={`${row} text-emerald-700`}
              onClick={() => { onUploadClick(); onClose(); }}>
              {hasImage ? "Upload New Photo" : "Upload a Photo"}
            </button>
          )}

          <button type="button" onClick={onClose} className={`${row} font-medium text-slate-400`}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
