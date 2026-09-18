/**
 * 🚀 High-Performance Unified Unsigned Cloudinary Infrastructure Utility
 * Uploads binary data streams directly to your free Cloudinary tier using the active unsigned preset.
 * Bypasses Vercel's 4.5MB payload limitations completely.
 * @param {File} fileObject - The raw file from an <input type="file" />
 * @param {"products"|"profiles"} folderType - Target bucket directory matching your requirements
 * @returns {Promise<string|null>} - Returns the permanent optimized secure URL string path or null
 */
export async function uploadImageToCloudinary(fileObject, folderType = "products") {
  try {
    if (!fileObject) return null;

    // 1. Wrap parameters into a standard browser Multipart FormData envelope
    const formData = new FormData();
    formData.append("file", fileObject);
    formData.append("upload_preset", "sokodigi_unsigned_preset"); // 🎯 Matches your dashboard preset exactly!
    
    // Explicitly organize directories inside your Cloudinary repository structure
    const targetFolder = folderType === "profiles" ? "sokodigi/profiles" : "sokodigi/products";
    formData.append("folder", targetFolder);

    // 🎯 THE FIX: Hardcode your Cloudinary cloud name directly into the endpoint URL.
    // Replace 'rwmnwbe' with the exact "Cloud Name" string shown at the top-left of your Cloudinary console!
    const CLOUD_NAME = "rwmnwbme"; 
    const cloudinaryUrl = `https://cloudinary.com{CLOUD_NAME}/image/upload`;
    
    console.log("🚀 Initializing direct unsigned cloud file delivery stream...");
    
    // 2. Dispatch the binary payload straight to Cloudinary's globally distributed edge CDNs
    const uploadResponse = await fetch(cloudinaryUrl, {
      method: "POST",
      body: formData // Browser handles Content-Type boundaries automatically
    });

    if (!uploadResponse.ok) {
      const errLogs = await uploadResponse.json();
      throw new Error(errLogs.error?.message || "Cloudinary media server rejected upload stream.");
    }

    const uploadResult = await uploadResponse.json();

    // 🎯 SUCCESS: Returns the permanent secure asset URL link string path
    return uploadResult.secure_url;

  } catch (error) {
    console.error("❌ Unified Unsigned Media Upload Engine Failure:", error.message);
    alert(`Media Upload Aborted: ${error.message}`);
    return null;
  }
}
