import { z } from "zod";

// Login only checks that the fields are filled in. Strength rules belong at signup.
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email address is required.")
    .max(254, "That email address is too long.")
    .email("Please enter a valid email address."),

  password: z
    .string()
    .min(1, "Password is required.")
    .max(128, "That password is too long."),

  rememberMe: z.boolean().optional(),
});

export default loginSchema;
