# Interview engine on the website (GRE-2612)

The Parallel Interview engine ("Everest") from `Johnprempeh2/parallel-discovery-agent` runs on the website: same
engine, website sign-in (Better Auth), Netlify Database, Netlify Functions. **Port, don't rewrite**: every engine
module keeps its source name, logic, prompts and constants. Only the data plane, the auth plane and the page shell
change. Where a line had to change, the ported file says why in a `// Port:` comment.

Source commit ported: `505ba6a` (Voice: Everest is aura-2-draco-en).

## What changes and what does not

| Source (Vercel)                                   | Website (Netlify)                                                       |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| Supabase Postgres, `public` schema                | Netlify Database, schema **`interview`**, same table and column names   |
| `supabaseService()` (service role, bypasses RLS)  | `interviewDb(identity)`: a supabase-js-shaped client over `pg`, every statement in its own transaction as role `interview_worker` with claims set (the claims bridge) |
| Clerk / Supabase Auth, email is the join key      | Better Auth only. People are keyed by the **Better Auth user id**; the verified email is used once, to claim an invite at join |
| No client id on rows                              | Every client-scoped row carries **`customer_id`**: the website organisation id (`customers.id`, John's rule 2) |
| `/join/<token>` enrol with a typed email          | `#join/<token>`: sign up or sign in with a website account first (email verified), then enrol |
| Next.js server components and server actions     | React pages under `#portal/interview…` that call `/api/interview/portal` ops |
| `/api/chat`, `/api/voice/start`, `/api/voice/think` | `/api/interview/chat`, `/api/interview/voice/start`, `/api/interview/voice/think` |
| Admin UI in the app (`/admin`, `/team`, `/requests`) | Not ported. GSAM runs the round through the bridge (GRE-2611)        |
| `notion_outbox` drained to Notion                 | `outbox` table, read by GSAM through the bridge. The site never calls GSAM |
| Vercel cron (retention, outbox sweep)             | Netlify scheduled functions (retention delete, abandonment close-out)   |
| Synthesis in a server action                      | **Made in GSAM** (GRE-2611): GSAM reads completed interviews and pushes the released synthesis through the bridge. The ported pipeline (background function `interview-synthesis-background`) is only a fallback |
| Old Everest dry-run data                          | Left behind, not imported (internal dry runs only; keyed by email, no organisation id) |

## Data plane

All tables live in schema `interview` (no clash with the site's `engagements`, `customers` and so on). Migration
`netlify/database/migrations/054_interview_engine` is the source's 0001 to 0017 folded into one, adapted only where a
`Port:` note says so.

### Organisation and user on every row

The website organisation id is `customers.id`. The column is named `customer_id`, as the GRE-2623 gate
(`scripts/check-org-scoping.mjs`) requires; the bridge calls it `organisationId`. `org_id` on `engagement` is the
Greatstone tenant, not the client.

- `engagement.customer_id` is NOT NULL with a foreign key to `customers (id, org_id)`: a round cannot point at an
  organisation that does not exist, or at another tenant's.
- Every other client-scoped table (`org_unit`, `employee`, `session`, `turn`, `insight`, `synthesis*`,
  `context_pack`, `usage_ledger`, `outbox`, `consent_event`, `seat_*`, `audit_log`, `memory_blob`) has
  `customer_id NOT NULL`. A trigger fills it from the parent row and refuses a value that disagrees with the parent;
  it cannot change after insert. Rehearsal row R11 (null or wrong organisation id) is 0 by construction.
- `user_id` (Better Auth user id) is on `employee` (empty until the invited person joins), and NOT NULL on `session`,
  `turn`, `insight`, `consent_event`, `memory_blob`. `person.auth_user_id` is NOT NULL.
- Memory never crosses organisations: `memory_blob` is keyed by person and organisation.
- `person` (the identity) and `rate_event` (counters) hold no client data and are allow-listed in the gate.

Roles:

- `interview_worker`: NOLOGIN, NOBYPASSRLS. The only role with grants on schema `interview`. `anon`,
  `authenticated` and `service_role` get nothing in this schema, so no other site function can read interview data.
- Every table has RLS enabled and forced. No policy, no access.

Claims (set with `set_config('request.jwt.claims', …, true)`, so they end with the transaction):

- Interviewee request: `{ "role": "interview_worker", "scope": "participant", "sub": <better-auth user id>, "email": <verified email, lower case>, "email_verified": true }`.
- Bridge request: `{ "role": "interview_worker", "scope": "system", "org": <tenant>, "customer_id": <organisation id from the path> }`.
- Other system work (retention, abandonment, voice think after token check, fallback synthesis): `{ "role": "interview_worker", "scope": "system" }`.

Policies (`interview.is_system()`, `interview.claim_user_id()`, `interview.claim_customer_id()`, `interview.claim_email()` helpers):

- `engagement`, `org_unit`, `context_pack`: participant may SELECT (metadata needed for enrolment and the prompt);
  only system writes.
- `person`, `employee`: participant sees and updates only rows with its own user id. The one exception: an invited
  employee row with no user id yet and the claim email may be read and claimed once (it then takes the user id).
- `session`, `turn`, `insight`, `consent_event`, `usage_ledger`, `memory_blob`: participant reaches only rows with
  its own user id.
- System scope with a `customer_id` claim (every bridge call) reaches only that organisation's rows.
- `synthesis`, `synthesis_cache`, `seat_request`, `seat_purchase`, `outbox`, `audit_log` (read): system only.
  `rate_event` and `audit_log` (insert): any worker request.
- `claim_seat()` and the other source functions stay SECURITY DEFINER with EXECUTE for `interview_worker` only.

`netlify/functions/lib/interview/db.mjs` exports:

```js
interviewDb(identity)       // identity = { id, email } from Better Auth, or 'system'
// returns a client with the supabase-js surface the engine uses:
db.from(table).select(cols).eq().neq().in().is().not().gt().gte().lt().lte().like().ilike().contains()
  .order(col, { ascending }).limit(n).single().maybeSingle()
db.from(table).insert(rows).select(cols)   .update(patch).eq(…)   .upsert(rows, { onConflict })   .delete().eq(…)
db.rpc(fn, args)
db.sql(text, params)        // escape hatch for the few embedded selects (`engagement:engagement_id!inner(*)`)
// every call resolves to { data, error, count } like supabase-js; error carries .code (Postgres SQLSTATE) and .message
```

## Identity and enrolment

- The website account is the only way in. No anonymous interview, no magic link without an account.
- `#join/<token>` shows the round's name. The person signs up or signs in (Better Auth, email verified). Then
  `enrol` checks, on the server: the token is active and not expired, the verified email's domain is in
  `allowed_email_domains`, the optional team target is a real unit of this round, a seat is free (`claim_seat` stays
  the hard gate at session start), and the rate limits per token and per IP.
- People GSAM invites are created ahead (bridge `invites`), with no user id. When they join with a verified account
  of the invited email, the row takes their Better Auth user id; from then on only the user id matches.
- The same account is the client portal login (decision 2, GRE-2609).

## Endpoints

Interviewee (Better Auth session cookie; 401 without it):

- `POST /api/interview/chat` — body `{ sessionId, content?, clientTurnId? }`, SSE response, events `meta`, `delta`,
  `reset`, `done`, `error`. Exactly the source `/api/chat` contract (idempotent on `clientTurnId`, rate limited,
  hard token cap 429).
- `POST /api/interview/portal` — body `{ op, args }`. Ops map one to one to the source server actions and page
  loaders: `interview-page`, `session-page`, `start`, `pause`, `discard`, `decline`, `rejoin`, `signoff-page`,
  `confirm-signoff`, `submit-correction`, `results` (released synthesis only, client admins only). A source
  `redirect('/interview/x')` becomes `{ redirect: '#portal/interview/x' }`.
- `POST /api/interview/join` — `{ op: 'info', token }` (public, no personal data) and `{ op: 'enrol', token, name,
  unitId? }` (signed in, verified email).
- `POST /api/interview/voice/start` — source `/api/voice/start`; 404 when `VOICE_ENABLED=0` or no Deepgram key.

- `POST /api/interview/my-data` — `{ op: 'see' }` (the person's own rounds, transcripts, insights, consent choices and
  quotes used; also the download) and `{ op: 'delete', engagementId, confirm: true }` (GRE-2653). Website account
  only; RLS keeps it to the person's own rows.

Public, for Deepgram only:

- `POST /api/interview/voice/think` — the OpenAI-wire think endpoint Deepgram calls. Authorised by the per-session
  voice token (hash on the session), never by a cookie.

GSAM bridge (signed, `contracts/gs-interview-v1/`): under `/api/admin/v1/interview/organisations/{organisationId}/…`
(every call keyed by the organisation id), served by the existing
`admin-bridge` function. GSAM calls outward; the site never calls GSAM.

Pages (hash routes, inside the signed-in portal): `#portal/interview`, `#portal/interview/session`,
`#portal/interview/complete`, `#portal/interview/goodbye`, `#portal/interview/discarded`,
`#portal/interview/results`, and the public `#join/<token>`.

## Models and switches (environment)

| Variable | Default | Note |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | none | secret, John sets it |
| `DEEPGRAM_API_KEY` | none | secret, John sets it |
| `INTERVIEW_MODEL` | `claude-sonnet-4-6` | as the source |
| `EXTRACTION_MODEL` | `claude-haiku-4-5` | as the source |
| `SYNTHESIS_MODEL` | `claude-opus-4-6` | as the source |
| `VOICE_INTERVIEW_MODEL` | `claude-haiku-4-5` | as the source: Haiku for voice |
| `VOICE_ENABLED` | on when `DEEPGRAM_API_KEY` is set | as the source: `0` takes voice away from everyone, typed stays. An env change needs a redeploy (minutes). For a change in seconds, GSAM sends the round with `voice: false` |
| `INTERVIEW_RETENTION_DRY_RUN` | off | `1`: the daily retention job counts and rolls back |
| `INTERVIEW_ENABLED` | off | kill switch for the whole engine on a site |
| `CHAT_RATE_SESSION_PER_MIN`, `CHAT_RATE_EMPLOYEE_PER_MIN`, `CHAT_HARD_BUDGET_RATIO`, `JOIN_RATE_*` | as the source | |

## Typed only (the Indago fallback)

The fallback is this engine with voice off, never the standalone app. With `VOICE_ENABLED=0` (or a round sent with
`voice: false`) voice is not offered, `voice/start` answers 404, and the typed interview runs every phase, sign-off
read-back, consent and close-out on its own. The regression suites run in both modes.

## Voice: do not regress

Clause buffering (`clause-buffer`), the `aura-2-` voice (`aura-2-draco-en`), one shared 48 kHz `AudioContext`,
Deepgram auth by WebSocket subprotocol (no key in the URL), `AgentCancel` on barge-in, `mip_opt_out: true`. The
browser client and its tests are ported line for line.

## Regression suites

Ported to `node --test` under `netlify/tests/interview-*.test.mjs`, against a real local Postgres with the
migrations applied (`netlify/tests/lib/postgres.mjs`) and a fake Anthropic client by default. Set
`INTERVIEW_LIVE=1` with `ANTHROPIC_API_KEY` to run the model-dependent ones live. Suites: security probe,
adversarial chat, concurrency, fuzzy merge, corroboration, interview smoke, plus the RLS suite for schema
`interview`.

## Staging and rollback

Staging is the site `gre1795-website-db-staging`. A preview deploy of a ready pull request gets its own database
branch (a copy of staging data) and Netlify applies `054_interview_engine` to it before the deploy goes live. Only
synthetic test accounts and test rounds are used; no client data before John's card.

Environment on the staging site (Functions scope):

- Set by Bedrock: `INTERVIEW_ENABLED=1`, `INTERVIEW_INTERNAL_SECRET` (random, secret; the bridge uses it to start
  the synthesis background function).
- Set by John (step card on GRE-2612): `ANTHROPIC_API_KEY`, `DEEPGRAM_API_KEY`. Without the Deepgram key voice is
  simply not offered; without the Anthropic key a chat turn fails with the calm error.
- Existing: `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `GSAM_BRIDGE_KEYS`,
  `APP_SITE_ORIGIN` (the join link's origin).

Rollback, in order: set `INTERVIEW_ENABLED` to anything but `1` (every interviewee endpoint answers 404 at once);
set `VOICE_ENABLED=0` to take voice away alone; remove the GSAM bridge keys to stop round changes. Code rollback is
a redeploy of the previous commit. `054_interview_engine/rollback.sql` drops schema `interview` and everything in it:
run it only after the round's outputs are exported to GSAM and a database snapshot is taken.

## Interview data rights (GRE-2653)

Spec: the `retention-rights-regions` document on GRE-2639. Wording: its `privacy-notice` document. Migration
`055_interview_data_rights`.

- **Retention per round.** `engagement.retention_days` (default 90), `readout_at`, `closed_at` (set when GSAM closes
  the round). Deletion date = readout (or close) + `retention_days`, or `retention_delete_after` if earlier
  (`deletion_due_at()`). `interview-retention` runs daily: anonymised themes copy (`anonymised_themes`: theme labels,
  counts, confidence, hours, team roll-ups; no statements, quotes, ids or names), then a hard delete of sessions,
  turns, insights, synthesis, synthesis cache and runs, outbox, per-person memory, invites (employee rows; those a
  seat request or purchase points at are cleared of name and email), people no other round holds, and the round's
  activity log. Kept: `consent_event` (it now carries `engagement_id`, keeps the 054 `user_id`, and survives the invite)
  and `usage_ledger` (session link nulled). Proof: a `deletion_record` row and a `retention_deleted` outbox event.
- **Self-service.** `lib/interview/self-service.mjs`, served by `/api/interview/my-data` and the "Interview data"
  card on the account page (`src/portal/InterviewDataCard.jsx`). Participant claims only; RLS matches the
  person's rows by website user id (054). Delete removes the
  person's rows for that round, writes a `withdrawal` consent event, takes them out of every synthesis of the round
  at once (two-voice rule re-applied) and sets `synthesis_stale_at`: a synthesis generated before it cannot be
  released again. The deletion record and activity log do not say who.
- **Quote choice.** Sign-off records one of `none`, `anonymous`, `named` (`employee.quote_choice`, consent kind
  `quotes`). Nothing is pre-selected and `applySignOffConsent` refuses without a choice. No choice (the person left)
  is read as `none`. A `none` person's insights still count in themes, but their quotes are stored as
  `{ quote: null, withheld: true }`, their words are scrubbed from model prose and from the brief, and only `named`
  people are ever named. Declined or withdrawn people are never follow-up targets.
- **Notice.** `src/portal/interview-notice.mjs` holds the short notice, the consent box, the quote options and the
  deletion date line for the welcome and sign-off screens.
- **Voice region.** `lib/interview/voice/regions.mjs`: Deepgram US agent and grant hosts (`agent.deepgram.com`, `api.deepgram.com`; John, 25 Oct: keep US). `mip_opt_out: true` stays.
