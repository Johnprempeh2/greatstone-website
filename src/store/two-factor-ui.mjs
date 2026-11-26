// Plain-English messages and helpers for the two-factor screens (GRE-6335).

// Better Auth error → what the visitor should do next.
export function twoFactorError(error) {
  const code = error?.code || '';
  if (code === 'INVALID_PASSWORD') return 'That password is not right.';
  if (code === 'INVALID_CODE' || code === 'INVALID_BACKUP_CODE') return 'That code is not right. Check it and try again.';
  if (code === 'TWO_FACTOR_CODE_REQUIRED') return 'Enter a code from your authenticator app or a recovery code.';
  if (code === 'ACCOUNT_TEMPORARILY_LOCKED') return 'Too many wrong codes. Wait 15 minutes, then sign in again.';
  if (error?.status === 429) return 'Too many tries. Wait a minute, then try again.';
  if (code === 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE' || code === 'INVALID_TWO_FACTOR_COOKIE') return 'This sign-in has expired. Enter your password again.';
  return error?.message || 'Something went wrong. Please try again.';
}

// Errors after which the code step cannot go on: the visitor must enter the password again.
export const restartsSignIn = (error) => ['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'INVALID_TWO_FACTOR_COOKIE'].includes(error?.code);

// The secret from an otpauth:// link, in groups of four for typing into an app by hand.
export function setupKey(uri) {
  try {
    const secret = new URL(uri).searchParams.get('secret') || '';
    return secret.replace(/=+$/, '').match(/.{1,4}/g)?.join(' ') || '';
  } catch { return ''; }
}
