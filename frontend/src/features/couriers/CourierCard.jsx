import { sizedImage } from "../../utils/image";

const VEHICLE = { motorcycle: "Motorcycle", car: "Car", van: "Van", bicycle: "Bicycle", on_foot: "On foot" };

export default function CourierCard({ courier }) {
  const img = sizedImage(courier.photo, 160);
  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
      {img ? <img src={img} alt={courier.name} className="h-14 w-14 shrink-0 rounded-full border-2 border-white object-cover shadow" /> : <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xl">🛵</span>}
      <div className="min-w-0 text-xs">
        <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">Your courier</p>
        <p className="truncate text-sm font-black text-slate-900">{courier.name}</p>
        <p className="font-semibold text-slate-700">{VEHICLE[courier.vehicleType] || "Vehicle"}{courier.plate ? ` · ${courier.plate}` : ""}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">Registered by the shop. Give your PIN only after you have your item.</p>
      </div>
    </div>
  );
}
