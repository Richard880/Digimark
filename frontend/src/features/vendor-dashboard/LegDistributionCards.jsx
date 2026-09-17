import React from "react";

export default function LegDistributionCards({ legBalanceMatrix = {}, spilloverMetrics = {} }) {
  const legs = Object.entries(legBalanceMatrix);

  return (
    <div className="space-y-6 text-left">
      {/* GLOBAL SYSTEM OVERVIEWS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Auto-Spillovers</span>
            <h4 className="text-xl font-black text-slate-800 mt-1">{spilloverMetrics.totalSpillovers || 0}</h4>
          </div>
          <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-100">
            {spilloverMetrics.spilloverRatePercentage || 0}% Spillover Rate
          </div>
        </div>
      </div>

      {/* ACTIVE DIRECT LEGS DECK */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-base font-bold text-slate-900">Direct Leg Balance Tracking</h3>
          <p className="text-xs text-slate-400">Real-time load balancing indexes across your 10 active matrix branch channels.</p>
        </div>

        {legs.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl text-xs text-slate-400 font-medium bg-slate-50/50">
            No direct matrix leg connections active yet. New downline members will balance here automatically.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {legs.map(([id, leg]) => (
              <div key={id} className="border border-slate-200/60 bg-slate-50/30 rounded-xl p-4 transition-all hover:border-emerald-600/30 hover:bg-white shadow-2xs">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-800">{leg.legLabel}</span>
                  <span className="text-[9px] font-mono font-bold tracking-wider text-slate-400 bg-white border border-slate-100 px-1.5 py-0.5 rounded">
                    ..{id.slice(-5)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                  <div className="bg-white border border-slate-100 rounded-lg p-2">
                    <span className="text-[9px] text-slate-400 block uppercase font-bold tracking-wider">Total Nodes</span>
                    <span className="text-sm font-black text-slate-800">{leg.totalCount}</span>
                  </div>
                  <div className="bg-white border border-slate-100 rounded-lg p-2">
                    <span className="text-[9px] text-emerald-600 block uppercase font-bold tracking-wider">Active</span>
                    <span className="text-sm font-black text-emerald-600">{leg.activeCount}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

