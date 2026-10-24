import SokoLogo from "../../../../assets/logo.png";

const POINTS = [
  ["🔒", "Escrow protection", "Your money is held until you confirm delivery."],
  ["📲", "Pay with M-Pesa", "Top up your wallet and shop in seconds."],
  ["💬", "Private chat", "End-to-end encrypted messages with sellers."],
];

export default function AuthShell({ title, subtitle, onClose, children }) {
  return (
    <section className="grid md:min-h-[640px] md:grid-cols-[5fr_7fr]">
      <div className="relative overflow-hidden bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-600 px-5 pb-5 pt-5 text-white md:flex md:flex-col md:justify-center md:p-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10" />
        {onClose && (
          <button type="button" onClick={onClose} className="mb-6 hidden items-center gap-1.5 text-xs font-bold text-emerald-100 hover:text-white md:inline-flex">← Back to Home</button>
        )}
        <div className="relative flex items-center gap-3 pr-10 md:flex-col md:items-start md:gap-6 md:pr-0">
          <span className="shrink-0 rounded-2xl bg-white p-2 shadow-lg"><img src={SokoLogo} alt="Sokodigi" className="h-9 w-auto md:h-12" /></span>
          <div className="min-w-0">
            <h1 className="text-xl font-black leading-tight tracking-tight md:text-4xl">{title}</h1>
            <p className="text-xs text-emerald-100 md:mt-2 md:text-base">{subtitle}</p>
          </div>
        </div>
        <ul className="relative mt-10 hidden space-y-4 md:block">
          {POINTS.map(([icon, t, text]) => (
            <li key={t} className="flex items-start gap-3"><span className="text-xl" aria-hidden="true">{icon}</span><p className="text-sm text-emerald-50"><b className="block text-white">{t}</b>{text}</p></li>
          ))}
        </ul>
      </div>
      <div className="px-4 py-5 sm:px-8 sm:py-8 md:px-10 md:py-10">{children}</div>
    </section>
  );
}
