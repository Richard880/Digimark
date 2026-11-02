import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import ROUTES from "../../constants/routes";

const field = "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const ERR = { LIST_LIMIT: "You have 10 lists already. Delete one first.", ITEM_LIMIT: "A list can hold 30 items.", OWN_PRODUCT: "You can't add your own product.", PRODUCT_UNAVAILABLE: "This product isn't available.", INVALID_NAME: "Give the list a name." };

export default function AddToListSheet({ product, quantity = 1, onClose }) {
  const [lists, setLists] = useState(null);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { apiClient.get("/lists").then(({ data }) => { setLists(data.lists); setPick(data.lists[0]?.id || "new"); }).catch(() => setLists([])); }, []);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);

  const save = async (e) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      if (pick === "new") await apiClient.post("/lists", { name: name.trim(), productId: product._id, quantity });
      else await apiClient.post(`/lists/${pick}/add`, { productId: product._id, quantity });
      setMsg({ ok: true, t: "Added to your list." });
    } catch (x) { setMsg({ ok: false, t: x.response ? ERR[x.response.data?.error] || "Couldn't add it. Please try again." : "Couldn't reach Sokodigi." }); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={save} role="dialog" aria-modal="true" aria-label="Add to shopping list" className="w-full space-y-3 rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-2xl">
        <h3 className="text-base font-black text-slate-900">Add to a shopping list</h3>
        <p className="truncate text-xs text-slate-500">{quantity} × {product.name}</p>
        {lists === null ? <p className="text-xs text-slate-500">Loading…</p> : (
          <>
            <select className={field} aria-label="List" value={pick} onChange={(e) => setPick(e.target.value)}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.items.length})</option>)}
              <option value="new">+ New list…</option>
            </select>
            {pick === "new" && <input className={field} placeholder="List name, e.g. Monthly groceries" aria-label="List name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />}
          </>
        )}
        {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded-xl px-3 py-2 text-xs font-bold ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{msg.t} {msg.ok && <Link to={ROUTES.SHOPPING_LISTS} className="underline">Open lists</Link>}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl bg-slate-100 text-xs font-bold text-slate-700">{msg?.ok ? "Close" : "Cancel"}</button>
          {!msg?.ok && <button type="submit" disabled={busy || lists === null || (pick === "new" && !name.trim())} className="min-h-11 flex-1 rounded-xl bg-emerald-700 text-xs font-bold text-white disabled:opacity-50">{busy ? "Adding…" : "Add"}</button>}
        </div>
      </form>
    </div>
  );
}
