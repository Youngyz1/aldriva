/**
 * lib/password-policy.ts
 *
 * Single shared password policy (P2 F-11) — signup and reset-password must
 * enforce identical requirements, otherwise reset is a downgrade path for
 * the credential itself.
 *
 * Rules (taken verbatim from the original signup flow, now canonical here):
 *  - at least 8 characters
 *  - at least 1 capital letter
 *  - at least 1 letter (covered by the capital rule in practice, kept for
 *    the strength-meter UI which lists it separately)
 *  - at least 1 number
 *  - at least 1 special character (non-alphanumeric)
 *
 * Pure module — zero imports — safe for client components and tests.
 */

export interface PasswordRules {
  isMinLength: boolean;
  hasCapitalLetter: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
  hasSpecialChar: boolean;
}

export function passwordRules(password: string): PasswordRules {
  const value = password ?? "";
  return {
    isMinLength: value.length >= 8,
    hasCapitalLetter: /[A-Z]/.test(value),
    hasLetter: /[a-zA-Z]/.test(value),
    hasNumber: /[0-9]/.test(value),
    hasSpecialChar: /[^a-zA-Z0-9]/.test(value),
  };
}

export interface PasswordValidation {
  valid: boolean;
  error?: string;
}

export const PASSWORD_POLICY_ERROR = "Password does not meet the security requirements.";

export function validatePassword(password: string): PasswordValidation {
  const rules = passwordRules(password);
  if (
    !rules.isMinLength ||
    !rules.hasCapitalLetter ||
    !rules.hasLetter ||
    !rules.hasNumber ||
    !rules.hasSpecialChar
  ) {
    return { valid: false, error: PASSWORD_POLICY_ERROR };
  }
  return { valid: true };
}
