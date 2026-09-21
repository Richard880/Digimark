import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../auth/hooks/useAuth";

const API_URL = import.meta.env.PROD 
  ? "" 
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/\$/, "");

export default function MyTeamDirectory() {
  const navigate = useNavigate();
  const { auth } = useAuth();
  
  const [teamData, setTeamDirectory] = useState(null);
  const [activeGenerationTab, setActiveGenerationTab] = useState("level_1");
  const [isLoading, setIsLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState("");

  useEffect(() => {
    const loadTeamDirectory = async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch(`${API_URL}/api/network/team-directory`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.ok) setTeamDirectory(data.generations);
        }
      } catch (err) {
        console.error("Failed to load affiliates directory mapping:", err);
      } finally {
        setIsLoading(false);
      }
    };
    if (auth?.currentUser) loadTeamDirectory();
  }, [auth]);

  const currentGenerationList = teamData?.[activeGenerationTab] || [];

  const filteredMembers = currentGenerationList.filter(m => {
    const query = filterQuery.toLowerCase().trim();
    return m.name.toLowerCase().includes(query) || m.username.toLowerCase().includes(query);
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm font-semibold text-slate-400 animate-pulse">Loading connection matrices...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8 border-b border-slate-200 pb-5 sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">My Network Community</h1>
          <p className="mt-2 text-sm text-slate-500">View and track all direct and spilled affiliates inside your 10x4 forced-matrix tree.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Search affiliates by name..."
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm placeholder-slate-400 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:emerald-500 sm:w-64"
          />
        </div>
      </div>

      {/* GENERATIONAL LEVEL SELECTOR MENU */}
      <div className="flex border-b border-slate-200 mb-6 bg-white p-1 rounded-xl shadow-xs gap-1">
        {["level_1", "level_2", "level_3", "level_4"].map((lvl, index) => (
          <button
            key={lvl}
            type="button"
            onClick={() => { setActiveGenerationTab(lvl); setFilterQuery(""); }}
            className={`flex-1 text-center py-3 text-xs font-bold uppercase tracking-wider rounded-lg transition ${
              activeGenerationTab === lvl 
                ? "bg-emerald-600 text-white shadow-xs" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            Generation {index + 1} ({teamData?.[lvl]?.length || 0})
          </button>
        ))}
      </div>

      {/* DYNAMIC FRIENDS CARDS LAYOUT LIST */}
      {filteredMembers.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => (
            <div 
              key={member.id} 
              onClick={() => navigate(`/profile/${member.id}`)}
              className="group relative flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-500/30 hover:shadow-md transition cursor-pointer transform active:scale-98"
            >
              <div className="relative h-14 w-14 shrink-0 rounded-full border border-slate-100 bg-slate-50 overflow-hidden">
                {member.profilePhoto ? (
                  <img src={member.profilePhoto} crossOrigin="anonymous" alt={member.name} className="h-full w-full object-cover" />
                ) : (
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full text-slate-300"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
                )}
                <span className={`absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-white ${member.membershipStatus === "active" ? "bg-emerald-500" : "bg-amber-400"}`} />
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-bold text-slate-800 group-hover:text-emerald-700 transition">{member.name}</h4>
                <p className="truncate text-xs text-slate-400">@{member.username}</p>
                <p className="truncate text-xs font-semibold text-slate-500 mt-1">{member.brandName}</p>
              </div>

              <div className="shrink-0 text-right">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide ${member.membershipStatus === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {member.membershipStatus}
                </span>
                <p className="text-[10px] text-slate-400 mt-2">{new Date(member.joinedAt).toLocaleDateString("en-KE")}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center bg-white rounded-2xl border border-slate-100 py-16 px-4 shadow-sm">
          <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          <h3 className="mt-4 text-sm font-bold text-slate-800">No affiliates found</h3>
          <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto">There are no registered or spilled accounts on Generation {activeGenerationTab.replace("level_", "")} of your matrix team yet.</p>
        </div>
      )}
    </div>
  );
}
