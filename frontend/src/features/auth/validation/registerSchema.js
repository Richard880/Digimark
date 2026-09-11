import { z } from "zod";

export const registerSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, "First name must be at least 2 characters.")
      .max(50, "First name cannot exceed 50 characters."),

    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters.")
      .max(50, "Last name cannot exceed 50 characters."),

    email: z
      .string()
      .trim()
      .email("Please enter a valid email address."),

    phoneNumber: z
      .string()
      .trim()
      .min(10, "Please enter a valid phone number.")
      .max(20, "Phone number is too long."),

    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
        "Password must contain at least one uppercase letter, one lowercase letter and one number."
      ),

    confirmPassword: z.string(),

    /* 🎯 INJECTED: Optional Sponsor ID Constraint 
       Allows empty strings, undefined keys, or valid input sequences flawlessly */
    sponsorId: z
      .string()
      .trim()
      .max(30, "Sponsor ID is too long.")
      .optional()
      .or(z.literal("")),

    acceptTerms: z.literal(true, {
      errorMap: () => ({
        message: "You must accept the Terms and Conditions.",
      }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export default registerSchema;
