-- 0027_welcome_email.sql — once-only marker for the welcome / onboarding email.
--
-- Ben (1 Jul): registration only fires Supabase's bare confirmation email, with no introduction to who
-- Greatstone is or what to do next. The branded welcome email (src/lib/welcome-email.mjs, unit-tested) is
-- sent by the send-welcome-email edge function the first time the new customer lands on their account
-- dashboard (immediately after they confirm + sign in). This column is the server-side once-only guard:
-- the function claims it atomically (UPDATE ... WHERE welcome_email_sent_at IS NULL), so repeat visits,
-- double-clicks or concurrent calls can never send twice. NULL for existing users is correct: they are not
-- new, and the function only fires for accounts that have never been welcomed AND only once Resend is
-- configured — so pre-existing customers who visit after go-live receive it once, which is acceptable.
--
-- Apply with the rest of the migrations. Idempotent. No secrets. No RLS change (the column rides the
-- existing customer_users policies; only the service-role function writes it).

ALTER TABLE customer_users ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN customer_users.welcome_email_sent_at IS
  'When the branded welcome email was sent (send-welcome-email edge fn). NULL = not yet sent. '
  'Claimed atomically by the function so the email can never send twice.';
