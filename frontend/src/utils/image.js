// Cloudinary resizes images on the fly, so phones download much smaller files
export function sizedImage(url, w = 800) {
  if (typeof url !== "string" || !url.startsWith("https://res.cloudinary.com/") || !url.includes("/image/upload/")) return url || "";
  if (/\/image\/upload\/[^/]*(w_|f_|q_)/.test(url)) return url;
  return url.replace("/image/upload/", `/image/upload/f_auto,q_auto,w_${w}/`);
}
