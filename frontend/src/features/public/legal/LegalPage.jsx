import { Link } from "react-router-dom";
import ROUTES from "../../../constants/routes";

const UPDATED = "October 2026";

const PAGES = {
  terms: {
    title: "Terms of use",
    sections: [
      ["Who we are", "Sokodigi is an online marketplace where verified sellers list products and buyers pay through a wallet funded with M-Pesa. We provide the platform. Each seller is responsible for their own products and deliveries."],
      ["Accounts", "You must give accurate details and keep your sign-in secure. You are responsible for activity on your account. Sellers and marketers must verify their email and keep an active membership to sell or earn."],
      ["How payments and escrow work", "When you place an order, the amount is held in escrow. It is released to the seller only when you give them your delivery PIN after receiving your item. If the seller cancels, you are refunded to your Sokodigi wallet. Never share your PIN before you have your item, and never pay outside Sokodigi: escrow protects only payments made in the app."],
      ["Fees", "Sokodigi charges a platform fee of 1% on each sale. A promoter who refers a sale through their link earns a 5% bonus, taken from the seller's proceeds. Membership plans are billed every 30 days from your wallet. Fees are shown before you pay."],
      ["Wallet and withdrawals", "Your wallet holds Kenya shillings. Top-ups are made with M-Pesa. Withdrawals are sent to the phone number saved on your account. We may delay or freeze a wallet to investigate fraud or a dispute."],
      ["Network commissions", "Members may earn commissions from membership payments in their network, subject to the rules in the app: active membership and meeting the monthly activity requirements. Earnings are not guaranteed and depend on your own efforts and activity. Commissions that are not claimable may be retained by Sokodigi."],
      ["Messaging", "Messages and photos between users are end-to-end encrypted, so Sokodigi cannot read them. You can block and report people. Reports include only what the reporter chooses to share."],
      ["Acceptable use", "Do not sell illegal or counterfeit goods, harass others, attempt to defraud users, or misuse the platform. We may suspend accounts that break these rules."],
      ["Disputes and liability", "If there is a problem with an order, contact the seller first, then Sokodigi support. To the extent the law allows, Sokodigi is not liable for the quality of items sold by sellers or for losses from payments made outside the platform."],
      ["Changes", "We may update these terms. Continued use after an update means you accept it."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    sections: [
      ["What we collect", "Your name, email, phone number, profile details, and for sellers a business address and brand details. We also record orders, wallet and M-Pesa transactions, and basic activity needed to run the network programme, such as the days you were active."],
      ["Why we use it", "To run your account, process orders and payments, deliver items, prevent fraud, pay commissions, support you, and meet legal obligations."],
      ["Messages", "Messages and photos are end-to-end encrypted on your device. We store encrypted data and cannot read it. We do see who you message and when."],
      ["Who we share it with", "Sellers receive the delivery details of your orders. Payment providers (Safaricom M-Pesa) process payments. Service providers such as hosting and image storage process data for us. We do not sell your personal data."],
      ["Your rights", "Under the Kenya Data Protection Act you can ask to access, correct or delete your data, and object to certain uses. Contact support to make a request."],
      ["Security", "Payments run over encrypted connections, and access to personal data is restricted. No system is perfectly secure, so use a strong password and keep your delivery PIN private."],
      ["Retention", "We keep records as long as needed to run your account and meet legal and accounting requirements."],
      ["Changes", "We may update this policy and will post the new version here."],
    ],
  },
};

export default function LegalPage({ page }) {
  const doc = PAGES[page];
  if (!doc) return null;
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">{doc.title}</h1>
      <p className="mt-1 text-xs text-slate-500">Last updated {UPDATED}</p>
      <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
        This is a plain-language summary. Please read it carefully before using Sokodigi.
      </p>
      <div className="mt-6 space-y-6">
        {doc.sections.map(([heading, text]) => (
          <section key={heading}>
            <h2 className="text-base font-extrabold text-emerald-900">{heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{text}</p>
          </section>
        ))}
      </div>
      <p className="mt-10 text-sm">
        <Link to={ROUTES.HOME} className="font-bold text-emerald-700 underline">← Back to Sokodigi</Link>
      </p>
    </article>
  );
}
