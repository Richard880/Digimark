/**
 * Upload an image directly to Cloudinary using an unsigned upload preset.
 * Automatically transforms the absolute URL into a same-origin proxy path to prevent CORS errors.
 *
 * @param {File} fileObject
 * @param {"products"|"profiles"} folderType
 * @returns {Promise<string|null>}
 */
export async function uploadImageToCloudinary(
  fileObject,
  folderType = "products"
) {
  try {
    if (!fileObject) {
      throw new Error("No image file was selected.");
    }

    const cloudName =
      import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ||
      "rwmnwbme";

    const uploadPreset =
      import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET ||
      "sokodigi_unsigned_preset";

    if (!cloudName) {
      throw new Error("Cloudinary cloud name is missing.");
    }

    if (!uploadPreset) {
      throw new Error("Cloudinary upload preset is missing.");
    }

    const formData = new FormData();
    formData.append("file", fileObject);
    formData.append("upload_preset", uploadPreset);

    const targetFolder =
      folderType === "profiles"
        ? "sokodigi/profiles"
        : "sokodigi/products";

    formData.append("folder", targetFolder);

    const cloudinaryUrl =
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

    console.log("Starting Cloudinary upload:", {
      cloudName,
      uploadPreset,
      targetFolder,
      fileName: fileObject.name,
      fileType: fileObject.type,
      fileSize: fileObject.size,
    });

    const uploadResponse = await fetch(cloudinaryUrl, {
      method: "POST",
      body: formData,
    });

    const responseText = await uploadResponse.text();
    let uploadResult;

    try {
      uploadResult = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Cloudinary returned an invalid response: ${responseText}`
      );
    }

    if (!uploadResponse.ok) {
      throw new Error(
        uploadResult?.error?.message ||
          `Cloudinary upload failed with status ${uploadResponse.status}.`
      );
    }

    if (!uploadResult?.secure_url) {
      throw new Error(
        "Cloudinary did not return a secure image URL."
      );
    }

    console.log("Cloudinary upload successful.");

    // 🎯 THE CORS FIX: Map the absolute URL to your Vercel reverse proxy route
    // Transforms: https://cloudinary.com...
    // Into: /cloudinary-assets/rwmnwbme/image/upload/...
    const absoluteUrl = uploadResult.secure_url;
    const proxiedUrl = absoluteUrl.replace("https://res.cloudinary.com", "/cloudinary-assets");

    // 🎯 UPDATE THIS AT THE BOTTOM OF CLOUDINARYUPLOADER.JS:
console.log("Cloudinary upload successful.");

// Return the absolute secure url string directly, bypassing the broken vercel asset proxy rule entirely
return uploadResult.secure_url;


    return proxiedUrl;
  } catch (error) {
    console.error(
      "Cloudinary upload failed:",
      error
    );
    throw error;
  }
}
