/**
 * Password policy constants and standard messages.
 *
 * SEC-15: Standardizes minimum password length to 10 characters across
 * all new-password entry points (signup, password reset, change password).
 * Existing users with shorter passwords remain supported at login.
 */

export const MIN_PASSWORD_LENGTH = 10

export const PASSWORD_MIN_LENGTH_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
export const PASSWORD_NEW_MIN_LENGTH_MESSAGE = `New password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
export const PASSWORD_MIN_LENGTH_HINT = `Must be at least ${MIN_PASSWORD_LENGTH} characters long.`
export const PASSWORD_PLACEHOLDER = `Min. ${MIN_PASSWORD_LENGTH} characters`
export const PASSWORD_WEAK_REQUIREMENTS_MESSAGE = `Password does not meet security requirements. Please choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`
