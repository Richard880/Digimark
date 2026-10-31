import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../services/apiClient";
import useAuth from "../auth/hooks/useAuth";
import useShop from "../shop/useShop";
import ROUTES from "../../constants/routes";

const fmt = (n) => `KES ${Number(n || 0).toLocaleString("en-KE")}`;
const when = (d) =>
  new Date(d).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const field =
  "min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-emerald-500 focus:outline-none";
const btn =
  "min-h-10 rounded-xl px-3 text-xs font-bold disabled:opacity-50";

const ERR = {
  OVERPAYMENT: "That's more than they owe.",
  INVALID_AMOUNT: "Enter a whole amount.",
  PHONE_TAKEN: "You already have a customer with that phone number.",
  INVALID_PHONE: "Enter a Kenyan number like 0712345678.",
  INVALID_NAME: "Enter a name.",
  INVALID_LIMIT: "The credit limit must be a whole number.",
  HAS_BALANCE: "Settle the balance before archiving.",
  PLAN_UPGRADE_REQUIRED:
    "That needs an active membership on a plan with customers.",
  CUSTOMER_LIMIT: "You've reached the customer limit.",
  INVALID_MPESA_REF: "The M-Pesa code is 10 letters and numbers.",
  TOO_MANY_REQUESTS: "You're going too fast. Wait a moment.",
};

const errMsg = (e) =>
  !e.response
    ? "Couldn't reach Sokodigi. Customers can't be changed offline."
    : ERR[e.response.data?.error] ||
      "Something went wrong. Please try again.";

const LABEL = {
  credit_sale: "Sold on credit",
  payment: "Payment received",
  void_sale: "Sale undone",
};

function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const Err = ({ text }) =>
  text ? (
    <p
      role="alert"
      className="rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700"
    >
      {text}
    </p>
  ) : null;

function CustomerForm({ customer, onClose, onSaved }) {
  const [f, setF] = useState({
    name: customer?.name || "",
    phone: customer?.phone ? `0${customer.phone.slice(3)}` : "",
    creditLimit: customer?.creditLimit ?? "",
    note: customer?.note || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError(ERR.INVALID_NAME);
    if (
      String(f.creditLimit).trim() !== "" &&
      !/^\d{1,8}$/.test(String(f.creditLimit).trim())
    ) {
      return setError(ERR.INVALID_LIMIT);
    }

    setBusy(true);
    setError("");

    const body = {
      name: f.name.trim(),
      phone: f.phone.trim() || null,
      note: f.note.trim(),
      creditLimit:
        String(f.creditLimit).trim() === "" ? null : Number(f.creditLimit),
    };

    try {
      const { data } = customer
        ? await apiClient.patch(`/customers/${customer._id}`, body)
        : await apiClient.post("/customers", body);
      onSaved(data.customer);
    } catch (x) {
      setError(errMsg(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title={customer ? "Edit customer" : "Add a customer"}
      onClose={busy ? () => {} : onClose}
    >
      <form onSubmit={save} className="space-y-3">
        <input
          className={field}
          placeholder="Name"
          aria-label="Name"
          maxLength={80}
          value={f.name}
          onChange={set("name")}
        />
        <input
          className={field}
          type="tel"
          inputMode="tel"
          placeholder="Phone (optional) e.g. 0712345678"
          aria-label="Phone"
          value={f.phone}
          onChange={set("phone")}
        />
        <input
          className={field}
          inputMode="numeric"
          placeholder="Credit limit in KES (blank = no limit)"
          aria-label="Credit limit"
          value={f.creditLimit}
          onChange={set("creditLimit")}
        />
        <input
          className={field}
          placeholder="Note (optional)"
          aria-label="Note"
          maxLength={200}
          value={f.note}
          onChange={set("note")}
        />
        <p className="text-[11px] text-slate-500">
          Only you can see your customers. Use their details only to run your
          shop, and keep them private.
        </p>
        <Err text={error} />
        <button
          type="submit"
          disabled={busy}
          className={`${btn} w-full bg-emerald-700 text-white`}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </Sheet>
  );
}

function PaySheet({ customer, shopName, uid, shop, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paid, setPaid] = useState(null);
  const ref = useRef(crypto.randomUUID().replace(/-/g, ""));

  const submit = async (e) => {
    e.preventDefault();
    const a = /^\d{1,8}$/.test(amount) ? Number(amount) : 0;
    if (a < 1) return setError(ERR.INVALID_AMOUNT);
    if (a > customer.balance) return setError(ERR.OVERPAYMENT);

    setBusy(true);
    setError("");

    let branchId = shop?.mainBranchId || "";
    try {
      branchId =
        localStorage.getItem(`sokodigi_pos_branch_${uid}`) || branchId;
    } catch {
      // Fall back to the shop's main branch.
    }

    try {
      const { data } = await apiClient.post(
        `/customers/${customer._id}/payments`,
        {
          amount: a,
          method,
          mpesaRef:
            method === "mpesa"
              ? code.trim().toUpperCase() || undefined
              : undefined,
          clientRef: ref.current,
          branchId,
        }
      );
      setPaid({ amount: a, balance: data.balance });
      onDone();
    } catch (x) {
      setError(
        !x.response
          ? "Couldn't confirm. Tap Save again: it won't be recorded twice."
          : errMsg(x)
      );
      if (x.response) ref.current = crypto.randomUUID().replace(/-/g, "");
    } finally {
      setBusy(false);
    }
  };

  const share = () =>
    window.open(
      `https://wa.me/${customer.phone || ""}?text=${encodeURIComponent(
        `${shopName}: we received KES ${paid.amount.toLocaleString(
          "en-KE"
        )} from you. Your balance is now KES ${Math.max(
          0,
          paid.balance
        ).toLocaleString("en-KE")}. Thank you!`
      )}`,
      "_blank",
      "noopener"
    );

  return (
    <Sheet
      title={`Payment from ${customer.name}`}
      onClose={busy ? () => {} : onClose}
    >
      {paid ? (
        <div className="space-y-3 text-center">
          <p className="text-3xl">✅</p>
          <p className="text-sm font-black text-slate-900">
            {fmt(paid.amount)} recorded. Balance: {fmt(paid.balance)}
          </p>
          <button
            type="button"
            onClick={share}
            className={`${btn} w-full border border-slate-200 text-slate-700`}
          >
            Send confirmation on WhatsApp
          </button>
          <button
            type="button"
            onClick={onClose}
            className={`${btn} w-full bg-emerald-700 text-white`}
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-slate-600">
            They owe <b>{fmt(customer.balance)}</b>.
          </p>
          <div className="flex gap-2">
            <input
              className={field}
              inputMode="numeric"
              placeholder="Amount (KES)"
              aria-label="Amount"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
            />
            <button
              type="button"
              onClick={() => setAmount(String(customer.balance))}
              className={`${btn} shrink-0 border border-slate-200 text-slate-700`}
            >
              Full
            </button>
          </div>
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1">
            {[
              ["cash", "💵 Cash"],
              ["mpesa", "📲 M-Pesa"],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={method === v}
                onClick={() => setMethod(v)}
                className={`flex-1 rounded-xl py-2.5 text-xs font-black ${
                  method === v
                    ? "bg-white text-emerald-900 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {method === "mpesa" && (
            <input
              className={field}
              placeholder="M-Pesa code (optional)"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          )}
          <Err text={error} />
          <button
            type="submit"
            disabled={busy}
            className={`${btn} w-full bg-emerald-700 text-white`}
          >
            {busy ? "Saving…" : "Record payment"}
          </button>
        </form>
      )}
    </Sheet>
  );
}

function Detail({
  id,
  shopName,
  uid,
  shop,
  writable,
  canPay,
  onClose,
  onChanged,
}) {
  const [c, setC] = useState(null);
  const [entries, setEntries] = useState([]);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [sub, setSub] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(
    async (p = 1) => {
      try {
        const { data } = await apiClient.get(`/customers/${id}`, {
          params: { page: p },
        });
        setC(data.customer);
        setEntries((prev) =>
          p === 1 ? data.entries : [...prev, ...data.entries]
        );
        setMore(data.hasMore);
        setPage(p);
      } catch (e) {
        setError(errMsg(e));
      }
    },
    [id]
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const remind = () =>
    window.open(
      `https://wa.me/${c.phone}?text=${encodeURIComponent(
        `Hello ${c.name}, this is a friendly reminder from ${shopName}: your balance is KES ${c.balance.toLocaleString(
          "en-KE"
        )}. Thank you!`
      )}`,
      "_blank",
      "noopener"
    );

  const archive = async () => {
    if (
      !window.confirm(
        "Archive this customer? They're hidden from the POS but the history is kept."
      )
    ) {
      return;
    }
    try {
      await apiClient.patch(`/customers/${id}`, { archived: true });
      onChanged();
      onClose();
    } catch (e) {
      setError(errMsg(e));
    }
  };

  const refreshed = () => {
    load(1);
    onChanged();
  };

  return (
    <Sheet title={c?.name || "Customer"} onClose={onClose}>
      {!c ? (
        <p className="py-6 text-center text-xs text-slate-500">
          {error || "Loading…"}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-emerald-50 p-4 text-center">
            <p className="text-[11px] font-bold uppercase text-emerald-700">
              {c.balance < 0 ? "Credit in their favour" : "They owe"}
            </p>
            <p className="text-3xl font-black text-emerald-900">
              {fmt(Math.abs(c.balance))}
            </p>
            {c.creditLimit != null && (
              <p className="text-[11px] text-slate-500">
                Limit {fmt(c.creditLimit)}
              </p>
            )}
            {c.phone && (
              <p className="mt-1 text-[11px] text-slate-500">
                …{c.phone.slice(-9)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {canPay && c.balance > 0 && (
              <button
                type="button"
                onClick={() => setSub("pay")}
                className={`${btn} bg-emerald-700 text-white`}
              >
                Record payment
              </button>
            )}
            {c.phone && c.balance > 0 && (
              <button
                type="button"
                onClick={remind}
                className={`${btn} border border-slate-200 text-slate-700`}
              >
                WhatsApp reminder
              </button>
            )}
            {writable && (
              <button
                type="button"
                onClick={() => setSub("edit")}
                className={`${btn} border border-slate-200 text-slate-700`}
              >
                Edit
              </button>
            )}
            {writable && (
              <button
                type="button"
                onClick={archive}
                className={`${btn} bg-slate-100 text-slate-600`}
              >
                Archive
              </button>
            )}
          </div>

          <Err text={error} />
          <h4 className="pt-1 text-xs font-black text-slate-800">History</h4>

          {entries.length === 0 ? (
            <p className="text-xs text-slate-400">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-xs">
              {entries.map((e) => (
                <li
                  key={`${e.createdAt}-${e.balanceAfter}`}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-800">
                      {LABEL[e.type]}
                      {e.method
                        ? ` (${e.method === "cash" ? "cash" : "M-Pesa"})`
                        : ""}
                    </p>
                    <p className="text-slate-500">
                      {when(e.createdAt)}
                      {e.note ? ` · ${e.note}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-black ${
                        e.amount > 0 ? "text-slate-900" : "text-emerald-700"
                      }`}
                    >
                      {e.amount > 0 ? "+" : "−"}
                      {fmt(Math.abs(e.amount))}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      owes {fmt(e.balanceAfter)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {more && (
            <button
              type="button"
              onClick={() => load(page + 1)}
              className={`${btn} w-full border border-slate-200 text-slate-700`}
            >
              Show more
            </button>
          )}
        </div>
      )}

      {sub === "pay" && c && (
        <PaySheet
          customer={c}
          shopName={shopName}
          uid={uid}
          shop={shop}
          onClose={() => setSub(null)}
          onDone={refreshed}
        />
      )}
      {sub === "edit" && c && (
        <CustomerForm
          customer={c}
          onClose={() => setSub(null)}
          onSaved={() => {
            setSub(null);
            refreshed();
          }}
        />
      )}
    </Sheet>
  );
}

export default function CustomersTab() {
  const { auth } = useAuth();
  const { shop, ent, can } = useShop();
  const uid = auth.user?._id ? String(auth.user._id) : "";
  const shopName = shop?.ownerName || "Sokodigi shop";
  const writable = can("customers.write") && ent.active && ent.features.customers;
  const canPay = can("customers.pay") && ent.active && ent.features.customers;

  const [rows, setRows] = useState([]);
  const [sum, setSum] = useState({ owed: 0, owing: 0 });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [state, setState] = useState("loading");
  const [dialog, setDialog] = useState(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(
    async (p = 1) => {
      try {
        const { data } = await apiClient.get("/customers", {
          params: {
            q: q.trim() || undefined,
            filter: filter === "owing" ? "owing" : undefined,
            page: p,
          },
        });
        setRows((prev) =>
          p === 1 ? data.customers : [...prev, ...data.customers]
        );
        setMore(data.hasMore);
        setPage(p);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [q, filter]
  );

  const loadSummary = useCallback(() => {
    apiClient
      .get("/customers/summary")
      .then(({ data }) => setSum(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(1), 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const changed = () => {
    load(1);
    loadSummary();
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const { data } = await apiClient.get("/customers/export.csv", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sokodigi-customers.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      // The button just stops spinning.
    } finally {
      setExporting(false);
    }
  };

  if (ent && ent.active && !ent.features.customers) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-4xl" aria-hidden="true">
          📒
        </p>
        <h2 className="mt-2 text-lg font-black text-slate-900">
          Customers and credit sales
        </h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
          Keep a list of customers, sell on credit, record payments and send
          reminders. Available from Merchant Pro (KSh 200 a month).
        </p>
        <Link
          to={ROUTES.MEMBERSHIP}
          className="mt-4 inline-block min-h-11 rounded-xl bg-emerald-700 px-6 py-3 text-sm font-black text-white"
        >
          Compare plans
        </Link>
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-label="Customers">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Customers</h2>
          <p className="text-xs text-slate-500">Who owes you, and what.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={exporting}
            className={`${btn} border border-slate-200 text-slate-700`}
          >
            {exporting ? "…" : "Export CSV"}
          </button>
          {writable && (
            <button
              type="button"
              onClick={() => setDialog({ type: "new" })}
              className={`${btn} bg-emerald-700 text-white`}
            >
              + Add customer
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500">Owed to you</p>
          <p className="mt-1 text-xl font-black text-amber-700">
            {fmt(sum.owed)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-bold text-slate-500">
            Customers owing
          </p>
          <p className="mt-1 text-xl font-black text-slate-900">{sum.owing}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or phone…"
          aria-label="Search customers"
          className={field}
        />
        <div className="flex gap-2">
          {[
            ["all", "All"],
            ["owing", "Owing"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={filter === v}
              onClick={() => setFilter(v)}
              className={`rounded-full px-4 py-2 text-xs font-bold ${
                filter === v
                  ? "bg-emerald-700 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {state === "loading" && (
        <div className="h-32 animate-pulse rounded-2xl bg-slate-100" />
      )}
      {state === "error" && (
        <p role="alert" className="text-xs font-bold text-red-600">
          Couldn't load customers.{" "}
          <button
            type="button"
            onClick={() => load(1)}
            className="underline"
          >
            Try again
          </button>
        </p>
      )}
      {state === "ready" && rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-xs text-slate-500">
          {q || filter === "owing"
            ? "No customers match."
            : "No customers yet. Add your regulars to sell to them on credit."}
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((c) => (
            <li key={c._id}>
              <button
                type="button"
                onClick={() => setDialog({ type: "detail", id: c._id })}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">
                    {c.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {c.phone ? `…${c.phone.slice(-9)}` : "No phone"}
                    {c.lastCreditAt ? ` · last credit ${when(c.lastCreditAt)}` : ""}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-black ${
                    c.balance > 0 ? "text-amber-700" : "text-slate-400"
                  }`}
                >
                  {c.balance > 0 ? fmt(c.balance) : "Settled"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {more && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => load(page + 1)}
            className={`${btn} border border-slate-200 bg-white px-8 text-slate-700`}
          >
            Show more
          </button>
        </div>
      )}

      {dialog?.type === "new" && writable && (
        <CustomerForm
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            changed();
          }}
        />
      )}
      {dialog?.type === "detail" && (
        <Detail
          id={dialog.id}
          shopName={shopName}
          uid={uid}
          shop={shop}
          writable={writable}
          canPay={canPay}
          onClose={() => setDialog(null)}
          onChanged={changed}
        />
      )}
    </section>
  );
}
