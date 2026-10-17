const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

const API_URL = import.meta.env.PROD
  ? ""
  : (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "");

/**
 * Signed upload: the backend authorizes each upload, then the browser sends the file straight to Cloudinary.
 * @param {File} file
 * @param {"products"|"profiles"} folderType
 * @param {() => Promise<string>} getIdToken  e.g. () => auth.currentUser.getIdToken()
 * @returns {Promise<string>} secure https URL
 */
export async function uploadImageToCloudinary(file, folderType = "products", getIdToken) {
  const fail = (userMessage, ...details) => {
    console.error("Cloudinary upload failed:", ...details);
    throw new Error(userMessage);
  };

  if (!file) throw new Error("No image file was selected.");
  if (!ALLOWED_TYPES.includes(file.type)) throw new Error("Please choose a JPG, PNG or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("Image must be smaller than 5 MB.");
  if (typeof getIdToken !== "function") fail("UPLOAD_FAILED", "getIdToken callback missing");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // 1. Ask our backend for a one-time permit
    const token = await getIdToken();
    if (!token) fail("Please sign in again.", "No auth token");

    const signRes = await fetch(`${API_URL}/api/upload/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ folderType }),
      signal: ctrl.signal,
    });
    if (signRes.status === 403) fail("Only active Sokodigi members can upload product photos.", "403 from /sign");
    if (signRes.status === 429) fail("Too many uploads. Please wait a minute.", "429 from /sign");
    if (!signRes.ok) fail("UPLOAD_FAILED", "sign status", signRes.status);
    const s = await signRes.json();

    // 2. Send the file with exactly the parameters the server signed
    const body = new FormData();
    body.append("file", file);
    body.append("api_key", s.apiKey);
    body.append("signature", s.signature);
    for (const [k, v] of Object.entries(s.uploadParams)) body.append(k, String(v));

    const res = await fetch(`https://api.cloudinary.com/v1_1/${s.cloudName}/image/upload`, {
      method: "POST",
      body,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) fail("UPLOAD_FAILED", res.status, data?.error?.message);

    const url = data.secure_url;
    if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/")) {
      fail("UPLOAD_FAILED", "Unexpected URL", url);
    }
    return url;
  } catch (err) {
    if (err.name === "AbortError") fail("UPLOAD_FAILED", "Timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
