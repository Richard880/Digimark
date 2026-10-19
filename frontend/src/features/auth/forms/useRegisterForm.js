import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { createUserWithEmailAndPassword, sendEmailVerification } from "firebase/auth";
import { auth } from "../../../firebase";
import { syncAccount, patchProfile, friendlyError } from "../authApi";
import { uploadImageToCloudinary } from "../../../utils/cloudinaryUploader";
import useAuth from "../hooks/useAuth";


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^(?:\+?254|0)[17]\d{8}$/;
const NAME_RE = /^[\p{L}][\p{L}\p{M}' -]{0,49}$/u;
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];
const MAX_MB = 5;

const resolver = (v) => {
  const e = {};
  const bad = (k, message) => { e[k] = { type: "validate", message }; };
  if (!NAME_RE.test((v.firstName || "").trim())) bad("firstName", "Enter your first name");
  if (!NAME_RE.test((v.lastName || "").trim())) bad("lastName", "Enter your last name");
  if (!EMAIL_RE.test((v.email || "").trim())) bad("email", "Enter a valid email address");
  if (!PHONE_RE.test((v.phoneNumber || "").replace(/[\s-]/g, ""))) bad("phoneNumber", "Enter a Kenyan number, e.g. 0712345678");
  const pw = v.password || "";
  if (pw.length < 8 || !/[A-Z]/.test(pw) || !/[0-9!@#$%^&*]/.test(pw)) {
    bad("password", "At least 8 characters, with a capital letter and a number");
  }
  if (v.confirmPassword !== pw) bad("confirmPassword", "Passwords do not match");
  if (!v.acceptTerms) bad("acceptTerms", "You must accept the terms to continue");
  return Object.keys(e).length ? { values: {}, errors: e } : { values: v, errors: {} };
};

export default function useRegisterForm({ onRegistered } = {}) {
  // ...inside useRegisterForm:
const { refreshProfile } = useAuth();
  const form = useForm({
    resolver,
    defaultValues: {
      accountCategory: "retail", firstName: "", lastName: "", email: "",
      phoneNumber: "", password: "", confirmPassword: "", acceptTerms: false,
    },
  });
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setAuthError("Please choose a JPG, PNG or WebP photo."); e.target.value = ""; return; }
    if (file.size > MAX_MB * 1024 * 1024) { setAuthError(`Photo must be smaller than ${MAX_MB} MB.`); e.target.value = ""; return; }
    setAuthError("");
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleRegister = form.handleSubmit(async (v) => {
    if (loading) return;
    setAuthError("");
    setLoading(true);
    try {
      const email = v.email.trim().toLowerCase();
      // Retry-safe: if an earlier attempt created the Firebase account but sync failed, reuse it
      if (!(auth.currentUser && auth.currentUser.email?.toLowerCase() === email)) {
        await createUserWithEmailAndPassword(auth, email, v.password);
        sendEmailVerification(auth.currentUser).catch(() => {});
      }
      // Everyone starts as a buyer. Becoming a marketer is a separate, verified step.
      await syncAccount({
        firstName: v.firstName.trim(),
        lastName: v.lastName.trim(),
        phoneNumber: v.phoneNumber.trim(),
        accountCategory: "retail",
      });

      // The photo needs a database user first (the signed upload checks it), so it goes last
      let photoFailed = false;
      if (photoFile) {
        try {
          const url = await uploadImageToCloudinary(photoFile, "profiles", () => auth.currentUser.getIdToken());
          await patchProfile({ profilePhoto: url });
        } catch (err) {
          console.error("Profile photo upload failed:", err);
          photoFailed = true; // never block the account over a photo
        }
      }
      onRegistered?.({ category: v.accountCategory, photoFailed });
      await refreshProfile(); // load the new account into the app state (and the photo, if any)
    } catch (err) {
      setAuthError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  });

  return {
    register: form.register,
    control: form.control,
    formState: form.formState,
    handleRegister,
    loading,
    authError,
    photoPreview,
    onPhotoChange,
  };
}
