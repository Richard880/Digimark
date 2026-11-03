const DAYS = Number(process.env.IDENTITY_LOCK_DAYS) > 0 ? Number(process.env.IDENTITY_LOCK_DAYS) : 30;
const FIELDS = ["displayName", "brandName", "brandCategory", "address"];
const same = (a, b) => String(a ?? "").trim() === String(b ?? "").trim();

// Returns true if the update changes a locked field and is allowed (the caller then stamps identityChangedAt).
// Throws PROFILE_LOCKED while the cooldown runs.
function assertCanChange(profile, body) {
  const changed = FIELDS.some((f) => body[f] !== undefined && !same(profile[f], body[f]))
    || (body.location?.county !== undefined && !same(profile.location?.county, body.location.county));
  if (!changed) return false;
  const last = profile.identityChangedAt && new Date(profile.identityChangedAt).getTime();
  if (last && last + DAYS * 86400000 > Date.now()) {
    throw Object.assign(new Error("PROFILE_LOCKED"), { http: 409, until: new Date(last + DAYS * 86400000) });
  }
  return true;
}
module.exports = { assertCanChange, DAYS };
