export default function GoldBadge({ small = false }) {
  return (
    <span
      title="Golden shop: consistently completes orders with few complaints"
      className={`inline-flex items-center gap-1 rounded-full bg-amber-100 font-black text-amber-800 ring-1 ring-amber-300 ${
        small ? "px-2 py-0.5 text-[9px]" : "px-2.5 py-1 text-[10px]"
      }`}
    >
      ★ Golden shop
    </span>
  );
}
