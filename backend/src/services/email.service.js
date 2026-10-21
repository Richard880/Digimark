const ENABLED = !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
if (!ENABLED) console.warn("⚠️  Email alerts are OFF. Set RESEND_API_KEY and EMAIL_FROM to enable them.");

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Never throws: an email problem must not break messaging
async function sendChatAlert({ to, fromName }) {
  if (!ENABLED) return false;
  const link = `${(process.env.FRONTEND_URL || "").replace(/\/$/, "")}/messages`;
  const name = String(fromName || "Someone").slice(0, 60);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [to],
        subject: "You have a new message on Sokodigi",
        text: `${name} sent you a message. Open Sokodigi to read it: ${link}\n\nFor your privacy, messages are never included in emails. You can turn these emails off in Messages.`,
        html: `<p><b>${esc(name)}</b> sent you a message.</p><p><a href="${esc(link)}">Open Sokodigi to read it</a></p><p style="color:#64748b;font-size:12px">For your privacy, messages are never included in emails. You can turn these emails off in Messages.</p>`,
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) console.error("❌ Email send failed:", r.status);
    return r.ok;
  } catch (e) {
    console.error("❌ Email error:", e.name);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendChatAlert };
