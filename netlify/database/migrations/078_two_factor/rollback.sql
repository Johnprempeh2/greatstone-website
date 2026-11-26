-- Rollback for 078_two_factor. Deploy the previous auth function first: until then Better Auth names these tables.
-- This turns two-factor sign-in off for every account and deletes their authenticator secrets and recovery codes;
-- after a later re-apply each user must enrol again.
DROP TABLE IF EXISTS better_auth."rateLimit";
DROP TABLE IF EXISTS better_auth."twoFactor";
ALTER TABLE better_auth."user" DROP COLUMN IF EXISTS "twoFactorEnabled";
