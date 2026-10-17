const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 5 * 1024 * 1024;
const TIMEOUT_MS = 60_000;
const FOLDERS = { products: "sokodigi/products", profiles: "sokodigi/profiles" };

/**
 * Uploads an image to Cloudinary with an unsigned preset.
 * Returns the secure https URL. Throws Error("UPLOAD_FAILED") for any failure,
 * and logs the real reason to the console only.
 */
export async function uploadImageToCloudinary(fileObject, folderType = "products") {
  const fail = (...details) => {
    console.error("Cloudinary upload failed:", ...details);
    throw new Error("UPLOAD_FAILED");
  };

  if (!fileObject) throw new Error("No image file was selected.");
  if (!ALLOWED_TYPES.includes(fileObject.type)) throw new Error("Please choose a JPG, PNG or WebP image.");
  if (fileObject.size > MAX_BYTES) throw new Error("Image must be smaller than 5 MB.");

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) fail("Missing VITE_CLOUDINARY_* environment variables");

  const body = new FormData();
  body.append("file", fileObject);
  body.append("upload_preset", uploadPreset);
  body.append("folder", FOLDERS[folderType] || FOLDERS.products); // the preset enforces the real folder

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body,
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      fail("Non-JSON response", res.status);
    }
    if (!res.ok) fail(res.status, data?.error?.message);

    const url = data?.secure_url;
    if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/")) {
      fail("Unexpected URL in response", url);
    }
    return url; // the absolute URL: the backend accepts only this form
  } catch (err) {
    if (err.message === "UPLOAD_FAILED") throw err;
    return fail(err.name === "AbortError" ? "Timed out" : err.message);
  } finally {
    clearTimeout(timer);
  }
}
