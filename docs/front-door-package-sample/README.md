# Front door package: sample

What the front door saves on each lead (GRE-468): the visitor's three employees as an Agent Companies
package, format `agentcompanies/v1-draft`. The business and the names are made up.

- `COMPANY.md`: the company, its industry, team size and brand words, and the team.
- `agents/<slug>/AGENTS.md`: one employee each. The lead has `reportsTo: null`; the other two report to the lead.

Made by `supabase/functions/_shared/front-door-package.mjs`; a test keeps this folder equal to its output.
In the studio, a lead's **Download agent package (.zip)** button gives the same files as a .zip for the
GS Agentic Manager import page (new company).
