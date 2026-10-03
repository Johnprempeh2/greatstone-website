-- 0032_front_door_agent_package.sql — the visitor's three employees as an Agent Companies package
-- (GRE-468, spec GRE-416 rev 2 §4 "Handover at sale", B8).
--
-- The `front-door` edge function saves the package on the lead at S5: a file map
-- { "COMPANY.md": "...", "agents/<slug>/AGENTS.md": "..." } in format agentcompanies/v1-draft
-- (supabase/functions/_shared/front-door-package.mjs). The studio leads tab downloads it as a .zip for the
-- GS Agentic Manager import page. Same RLS as the rest of the row (0031): staff read, no anon, no staff write.
--
-- Needs 0031. Until this is applied the edge function saves the lead without the package (it retries the
-- insert without the column), and the studio builds the .zip from the row's `agents` instead.
-- Re-runnable. Rollback: ALTER TABLE front_door_leads DROP COLUMN IF EXISTS agent_package;

ALTER TABLE front_door_leads ADD COLUMN IF NOT EXISTS agent_package jsonb;

ALTER TABLE front_door_leads DROP CONSTRAINT IF EXISTS chk_fdl_package;
ALTER TABLE front_door_leads ADD CONSTRAINT chk_fdl_package CHECK (
  agent_package IS NULL OR (jsonb_typeof(agent_package) = 'object' AND agent_package ? 'COMPANY.md'
    AND pg_column_size(agent_package) <= 65536));
