-- GRE-2794. The client organisation accepts the interview data processing agreement in the app, before any invite
-- goes out (gate GRE-2656; John, 26 Oct: no paper signature). One row per organisation and agreement text: who
-- accepted, as what, for which legal entity, when and from where. The site refuses invite create, invites/send
-- (resend, remind), the join link and a seat until the organisation has a row for the current text (the version
-- and its sha256, both in lib/interview/agreement.mjs). A new text needs a new row.
--
--   * Kept and never edited: UPDATE, DELETE and a TRUNCATE with rows raise for every role, the owner too. It outlives a
--     deleted round (no FK to engagement) and keeps the organisation (RESTRICT; customers are soft-deleted).
--   * Written and read by interview_worker with system claims keyed to the organisation (system_all), as every
--     other interview table. The company admin's request checks the admin row first (interview-agreement.mjs).
--
-- Rollback: rollback.sql in this folder.

SET LOCAL search_path TO interview, public;

CREATE TABLE agreement_acceptance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- the website client organisation (public.customers.id) that accepted
  customer_id        uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  agreement_key      text NOT NULL CHECK (agreement_key = 'interview-dpa'),
  agreement_version  text NOT NULL CHECK (agreement_version ~ '^v[0-9]{1,4}$'),
  content_sha256     text NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  -- the database clock, UTC
  accepted_at        timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- the company admin: Better Auth user id and customer_users row; name, email and role as given at acceptance
  user_id            text NOT NULL CHECK (length(user_id) BETWEEN 1 AND 100),
  customer_user_id   uuid NOT NULL,
  name               text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  email              text NOT NULL CHECK (length(email) BETWEEN 3 AND 254),
  role_title         text NOT NULL CHECK (length(btrim(role_title)) BETWEEN 1 AND 200),
  -- the Controller as typed: the agreement's [square bracket] blanks
  legal_name         text NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 1 AND 300),
  company_country    text CHECK (company_country IS NULL OR length(company_country) <= 100),
  company_number     text CHECK (company_number IS NULL OR length(company_number) <= 100),
  registered_address text CHECK (registered_address IS NULL OR length(registered_address) <= 500),
  read_confirmed     boolean NOT NULL CHECK (read_confirmed),
  authority_confirmed boolean NOT NULL CHECK (authority_confirmed),
  ip_address         text NOT NULL CHECK (length(ip_address) BETWEEN 1 AND 64),
  user_agent         text CHECK (user_agent IS NULL OR length(user_agent) <= 500),
  UNIQUE (customer_id, agreement_key, content_sha256)
);
CREATE INDEX idx_agreement_acceptance_customer ON agreement_acceptance (customer_id, accepted_at DESC);

CREATE FUNCTION agreement_acceptance_keep() RETURNS trigger
  LANGUAGE plpgsql SET search_path = interview, public, pg_temp AS $$
BEGIN
  -- an empty table may be truncated (TRUNCATE customers CASCADE on a fresh database); a kept record may not
  IF tg_op = 'TRUNCATE' AND NOT EXISTS (SELECT 1 FROM interview.agreement_acceptance) THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'agreement_acceptance is kept as written: % is not allowed', tg_op USING ERRCODE = '42501';
END;
$$;
CREATE TRIGGER trg_agreement_acceptance_keep BEFORE UPDATE OR DELETE ON agreement_acceptance
  FOR EACH ROW EXECUTE FUNCTION agreement_acceptance_keep();
CREATE TRIGGER trg_agreement_acceptance_keep_truncate BEFORE TRUNCATE ON agreement_acceptance
  FOR EACH STATEMENT EXECUTE FUNCTION agreement_acceptance_keep();

REVOKE ALL ON agreement_acceptance FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION agreement_acceptance_keep() FROM PUBLIC;
-- append and read only: the triggers refuse the rest whatever the grant
GRANT SELECT, INSERT ON agreement_acceptance TO interview_worker;

ALTER TABLE agreement_acceptance ENABLE ROW LEVEL SECURITY;
ALTER TABLE agreement_acceptance FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON agreement_acceptance FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
-- system claims keyed to one organisation reach only its rows; a participant reaches none
CREATE POLICY system_all ON agreement_acceptance FOR ALL TO interview_worker
  USING (interview.is_system() AND (interview.claim_customer_id() IS NULL OR customer_id = interview.claim_customer_id()))
  WITH CHECK (interview.is_system() AND (interview.claim_customer_id() IS NULL OR customer_id = interview.claim_customer_id()));
