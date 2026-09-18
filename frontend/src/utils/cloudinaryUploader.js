/**
 * 🚀 Unified Cloudinary Media Upload Infrastructure Utility
 * Streams binary files directly to Cloudinary edge nodes, bypassing Vercel caps entirely.
 * @param {File} fileObject - The raw file from an <input type="file" /> array string source
 * @param {"products"|"profiles"} folderType - Target bucket directory matching backend paths
 * @param {string} sessionToken - The active Firebase verification ID token
 * @returns {Promise<string|null>} - Returns the optimized secure URL string path or null if aborted
 */
export async function uploadImageToCloudinary(fileObject, folderType = "products", sessionToken) {
  try {
    if (!fileObject) return null;

    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

    // 1. Request a secure upload signature from your Express backend gatekeeper
    const signatureResponse = await fetch(`${API_URL}/api/upload/sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`
      },
      body: JSON.stringify({ folderType })
    });

    if (!signatureResponse.ok) {
      const errData = await signatureResponse.json();
      throw new Error(errData.error || "Backend rejected signature creation authorization.");
    }

    const credentials = await signatureResponse.json();
    
    // 2. Wrap the image file and signatures into an browser-native Multipart FormData envelope
    const formData = new FormData();
    formData.append("file", fileObject);
    formData.append("api_key", credentials.apiKey);
    formData.append("timestamp", credentials.timestamp);
    formData.append("signature", credentials.signature);
    formData.append("folder", credentials.folder);
    formData.append("upload_preset", "sokodigi_unsigned_preset"); // Matches your Cloudinary dashboard preset name

    // 3. Dispatch the binary payload straight to Cloudinary's media servers
    const cloudinaryUrl = `https://cloudinary.com{credentials.cloudName}/image/upload`;
    
    const uploadResponse = await fetch(cloudinaryUrl, {
      method: "POST",
      body: formData // Browser handles Content-Type boundary headers automatically for FormData objects
    });

    if (!uploadResponse.ok) {
      const errLogs = await uploadResponse.json();
      throw new Error(errLogs.error?.message || "Cloudinary upload request dropped.");
    }

    const uploadResult = await uploadResponse.json();

    // 🎯 THE WIN: Returns the permanent, compressed secure URL link string
    return uploadResult.secure_url;

  } catch (error) {
    console.error("❌ Unified Media Upload Engine Failure:", error.message);
    alert(`Media Upload Aborted: ${error.message}`);
    return null;
  }
}
