import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .max(72, "Password is too long.")
  .refine((value) => Buffer.byteLength(value, "utf8") <= 72, {
    message: "Password must be at most 72 UTF-8 bytes.",
  });

export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password.").max(200, "Password is too long."),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password.").max(200),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, "Enter your password to confirm.").max(200),
});
