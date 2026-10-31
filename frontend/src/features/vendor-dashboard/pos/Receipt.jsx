import { useEffect } from "react";

const fmt = (n) => Number(n || 0).toLocaleString("en-KE");
const when = (d) =>
  new Date(d).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function receiptText(s, shop) {
  const rows = s.lines.map(
    (l) => `${l.quantity} x ${l.name}  ${fmt(l.unitPrice * l.quantity)}`
  );

  return [
    shop.name,
    shop.place,
    ...(shop.phone ? [`Tel ${shop.phone}`] : []),
    ...(shop.taxPin ? [`PIN ${shop.taxPin}`] : []),
    `Receipt ${s.receiptNo}`,
    when(s.createdAt),
    "",
    ...rows,
    "",
    ...(s.discount ? [`Discount: -${fmt(s.discount)}`] : []),
    `TOTAL: KES ${fmt(s.total)}`,
    ...(s.creditAmount > 0 ? [`ON CREDIT: KES ${fmt(s.creditAmount)}`] : []),
    s.paymentMethod === "cash"
      ? `Paid in cash: ${fmt(s.amountTendered)}  Change: ${fmt(s.change)}`
      : `Paid by M-Pesa${s.mpesaRef ? ` (${s.mpesaRef})` : ""}`,
    "",
    shop.footer || "Thank you for shopping with us!",
  ]
    .filter((x, i) => x !== "" || i > 0)
    .join("\n");
}

export function ReceiptSheet({ sale, shop, onClose, onNew }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const share = () =>
    window.open(
      `https://wa.me/?text=${encodeURIComponent(receiptText(sale, shop))}`,
      "_blank",
      "noopener"
    );

  return (
    <div
      className="fixed inset-0 z-[3000] flex items-end justify-center bg-slate-900/60 sm:items-center sm:p-4"
      onMouseDown={(e) =>
        e.target === e.currentTarget && onClose()
      }
    >
      <style>{`@media print{body *{visibility:hidden}.receipt-print,.receipt-print *{visibility:visible}.receipt-print{position:absolute;left:0;top:0;width:80mm;box-shadow:none!important}}`}</style>

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:max-w-sm sm:rounded-2xl"
      >
        <div className="receipt-print rounded-xl border border-dashed border-slate-300 bg-white p-4 font-mono text-xs text-slate-800">
          {shop.logo && (
            <img
              src={shop.logo}
              alt=""
              className="mx-auto mb-1 h-12 object-contain"
            />
          )}

          <p className="text-center text-sm font-black">{shop.name}</p>
          {shop.place && <p className="text-center">{shop.place}</p>}
          {shop.phone && <p className="text-center">Tel {shop.phone}</p>}
          {shop.taxPin && <p className="text-center">PIN {shop.taxPin}</p>}

          <p className="mt-2 text-center">
            Receipt {sale.receiptNo}
            {sale.voided ? " (VOIDED)" : ""}
          </p>

          {sale.provisional && (
            <p className="mt-1 text-center font-bold">
              PROVISIONAL: final number is set when online
            </p>
          )}

          <p className="text-center">{when(sale.createdAt)}</p>
          <hr className="my-2 border-slate-300" />

          {sale.lines.map((l, i) => (
            <div key={i} className="flex justify-between gap-2">
              <span>
                {l.quantity} × {l.name}
              </span>
              <span>{fmt(l.unitPrice * l.quantity)}</span>
            </div>
          ))}

          <hr className="my-2 border-slate-300" />

          {sale.discount > 0 && (
            <div className="flex justify-between">
              <span>Discount</span>
              <span>-{fmt(sale.discount)}</span>
            </div>
          )}

          <div className="flex justify-between text-sm font-black">
            <span>TOTAL</span>
            <span>KES {fmt(sale.total)}</span>
          </div>

          {sale.creditAmount > 0 && (
            <>
              {sale.total - sale.creditAmount > 0 && (
                <div className="flex justify-between">
                  <span>Paid now</span>
                  <span>{fmt(sale.total - sale.creditAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-black">
                <span>ON CREDIT</span>
                <span>{fmt(sale.creditAmount)}</span>
              </div>
            </>
          )}

          {sale.paymentMethod === "cash" && (
            <>
              <div className="flex justify-between">
                <span>Cash</span>
                <span>{fmt(sale.amountTendered)}</span>
              </div>
              <div className="flex justify-between">
                <span>Change</span>
                <span>{fmt(sale.change)}</span>
              </div>
            </>
          )}

          {sale.paymentMethod === "mpesa" && (
            <div className="flex justify-between">
              <span>M-Pesa</span>
              <span>{sale.mpesaRef || "paid"}</span>
            </div>
          )}

          {sale.customerName && (
            <p className="mt-2">Customer: {sale.customerName}</p>
          )}

          <p className="mt-3 text-center">
            {shop.footer || "Thank you!"}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Print / Save PDF
          </button>

          <button
            type="button"
            onClick={share}
            className="min-h-11 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Share on WhatsApp
          </button>

          {onNew ? (
            <button
              type="button"
              onClick={onNew}
              className="col-span-2 min-h-12 rounded-xl bg-emerald-700 text-sm font-black text-white hover:bg-emerald-800"
            >
              New sale
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="col-span-2 min-h-11 rounded-xl bg-slate-100 text-sm font-bold text-slate-700"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
