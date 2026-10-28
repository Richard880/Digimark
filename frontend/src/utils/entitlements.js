// Simple client-side helper (you can expand later)
export function getPlanLabel(planKey) {
  const map = {
    phase1: "Solo Retailer",
    phase2: "Merchant Pro",
    phase3: "Smart-Hub",
    phase4: "Omnichannel",
  };
  return map[planKey] || "Solo Retailer";
}
