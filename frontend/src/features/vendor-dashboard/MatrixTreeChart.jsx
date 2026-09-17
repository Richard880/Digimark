
import React from "react";

export default function MatrixTreeChart({ generations = {} }) {
  // Normalize levels to an array matching your MAX_DEPTH constant boundary (4 levels)
  const levels = Object.entries(generations).map(([key, value]) => ({
    label: key.replace("level_", "GENERATION ").toUpperCase(),
    count: value,
  }));

  const totalDownline = levels.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm mb-6 text-left">
      <div className="mb-4">
        <h3 className="text-base font-bold text-slate-900">Network Generation Tiers</h3>
        <p className="text-xs text-slate-400">Distribution analysis across your 4 active network depth levels.</p>
      </div>

      <div className="space-y-4">
        {levels.map((level) => {
          // Calculate density width safely
          const percentage = totalDownline > 0 ? (level.count / totalDownline) * 100 : 0;
          
          return (
            <div key={level.label} className="flex flex-col space-y-1">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                <span>{level.label}</span>
                <span className="text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full font-bold">
                  {level.count} Nodes
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200/60">
                <div
                  className="bg-emerald-600 h-3 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(percentage, level.count > 0 ? 5 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
