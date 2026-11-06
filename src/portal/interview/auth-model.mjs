// Port: the interview's identity plane is the website account (Better Auth, email verified), replacing the
// source's Supabase Auth password form and typed-email enrolment (docs/INTERVIEW-ENGINE.md "Identity and
// enrolment"). Pure helpers, tested; the screens are InterviewSignIn.jsx and JoinPage.jsx.

export const MIN_PASSWORD = 8;

/** A Better Auth session whose email is verified. The user id is the key; the verified email only claims an invite at join. */
export const isVerified = (session) => Boolean(session?.user?.emailVerified);

/** Better Auth refuses a sign-in for an unverified email with this code (requireEmailVerification). */
export const isUnverifiedError = (error) =>
  Boolean(error) && (error.code === 'EMAIL_NOT_VERIFIED' || /not verified/i.test(String(error.message || '')));

/** Better Auth refuses a sign-up for an email that already has an account. */
export const isExistingAccountError = (error) =>
  Boolean(error) &&
  (/USER_ALREADY_EXISTS/i.test(String(error.code || '')) || /already exists/i.test(String(error.message || '')));

/** Plain-words message for a failed sign-in, in the source's voice. */
export function signInErrorMessage(error) {
  if (!error) return null;
  if (isUnverifiedError(error)) {
    return 'Please confirm your email first. We have just sent you a fresh link; open it, then sign in here.';
  }
  if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (error.code === 'INVALID_EMAIL_OR_PASSWORD' || error.status === 401) {
    return 'That email and password combination did not work. Please check both and try again.';
  }
  return 'Something went wrong. Please try again in a moment.';
}

/** Plain-words message for a failed sign-up. */
export function signUpErrorMessage(error) {
  if (!error) return null;
  if (isExistingAccountError(error)) {
    return 'It looks like you already have an account. Please log in with your email and password.';
  }
  if (/PASSWORD_TOO_SHORT/i.test(String(error.code || ''))) {
    return `Please choose a password of at least ${MIN_PASSWORD} characters.`;
  }
  if (/INVALID_EMAIL/i.test(String(error.code || ''))) {
    return 'That email address does not look right. Please check it and try again.';
  }
  if (error.status === 429) return 'That was a lot of attempts at once. Please wait a minute and try again.';
  return error.message || 'Something went wrong. Please try again in a moment.';
}

/** Where the verification email returns the person: straight back to the page they signed up on. */
export const verifyCallbackURL = (hash) => '/' + (String(hash || '').startsWith('#') ? hash : '#' + (hash || ''));
