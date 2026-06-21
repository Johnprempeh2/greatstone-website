// Pure password-strength scorer shared by every "set a password" field (signup, reset, security).
// No dependencies so it unit-tests in Node. Returns a 1–4 score (0 only for empty), a plain-English
// label, and one actionable hint — deliberately simple heuristics, NOT a security guarantee; the real
// gate is Supabase's policy + the 8-char minLength on the inputs.
export function scorePassword(pw) {
  pw = pw || '';
  if (!pw) return { score: 0, label: '', hint: '' };
  const len = pw.length;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(pw)).length;
  let score = 0;
  if (len >= 8) score++;
  if (len >= 12) score++;
  if (classes >= 2) score++;
  if (classes >= 3 && len >= 10) score++;
  // Obvious-weak passwords never read above "Weak", however long.
  if (/^(?:password|passw0rd|12345678|qwerty|letmein|welcome|greatstone)/i.test(pw)) score = 1;
  score = Math.max(1, Math.min(4, score));

  let hint = '';
  if (len < 8) hint = 'Use at least 8 characters';
  else if (classes < 2) hint = 'Mix in numbers or symbols';
  else if (score < 3) hint = 'Longer is stronger';

  return { score, label: { 1: 'Weak', 2: 'Fair', 3: 'Good', 4: 'Strong' }[score], hint };
}
