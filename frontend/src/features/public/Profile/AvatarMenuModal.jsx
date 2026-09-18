
import React from "react";

export default function AvatarMenuModal({ isOpen, onClose, currentImageUrl, onUploadClick, isOwnProfile }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200">
      {/* Click outside to close container track */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative bg-white rounded-2xl w-full max-w-xs overflow-hidden shadow-xl border border-slate-100 transform scale-100 transition-transform duration-200 text-center animate-fade-in">
        <div className="py-2 divide-y divide-slate-100">
          
          {/* OPTION 1: VIEW PICTURE LIGHTBOX (Always visible if a picture exists) */}
          <button
            type="button"
            onClick={() => {
              if (currentImageUrl) {
                window.open(currentImageUrl, "_blank");
              } else {
                alert("No active profile avatar uploaded yet.");
              }
              onClose();
            }}
            className="w-full py-3.5 text-sm font-bold text-slate-800 hover:bg-slate-50 transition active:bg-slate-100 block border-none bg-transparent cursor-pointer"
          >
            View Profile Picture
          </button>

          {/* OPTION 2: UPLOAD NEW IMAGE (Strictly restricted to the verified account owner) */}
          {isOwnProfile && (
            <button
              type="button"
              onClick={() => {
                onUploadClick();
                onClose();
              }}
              className="w-full py-3.5 text-sm font-bold text-emerald-700 hover:bg-emerald-50/50 transition active:bg-emerald-50 block border-none bg-transparent cursor-pointer"
            >
              Upload New Photo
            </button>
          )}

          {/* CANCEL TRIGGER BUTTON */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 text-sm font-medium text-slate-400 hover:bg-slate-50 transition active:bg-slate-100 block border-none bg-transparent cursor-pointer"
          >
            Cancel
          </button>
          
        </div>
      </div>
    </div>
  );
}
