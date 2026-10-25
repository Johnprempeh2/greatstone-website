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
| Clerk / Supabase Auth, email is the join key      | Better Auth website account; the **verified** email is the join key     |
| `/join/<token>` enrol with a typed email          | `#join/<token>`: sign up or sign in with a website account first (email verified), then enrol |
| Next.js server components and server actions     | React pages under `#portal/interview…` that call `/api/interview/portal` ops |
| `/api/chat`, `/api/voice/start`, `/api/voice/think` | `/api/interview/chat`, `/api/interview/voice/start`, `/api/interview/voice/think` |
| Admin UI in the app (`/admin`, `/team`, `/requests`) | Not ported. GSAM runs the round through the bridge (GRE-2611)        |
| `notion_outbox` drained to Notion                 | `outbox` table, read by GSAM through the bridge. The site never calls GSAM |
| Vercel cron (retention, outbox sweep)             | Netlify scheduled functions (retention delete, abandonment close-out)   |
| Synthesis in a server action                      | Background function `interview-synthesis-background` (15 min limit)     |

## Data plane

All tables live in schema `interview` (no clash with the site's `engagements`, `customers` and so on). Migration
`netlify/database/migrations/054_interview_engine` is the source's 0001 to 0017 folded into one, adapted only where a
`Port:` note says so.

Roles:

- `interview_worker`: NOLOGIN, NOBYPASSRLS. The only role with grants on schema `interview`. `anon`,
  `authenticated` and `service_role` get nothing in this schema, so no other site function can read interview data.
- Every table has RLS enabled and forced. No policy, no access.

Claims (set with `set_config('request.jwt.claims', …, true)`, so they end with the transaction):

- Interviewee request: `{ "role": "interview_worker", "scope": "participant", "sub": <better-auth user id>, "email": <verified email, lower case>, "email_verified": true }`.
- System request (bridge, synthesis, retention, abandonment, voice think after token check): `{ "role": "interview_worker", "scope": "system" }`.

Policies (`interview.is_system()`, `interview.claim_email()` helpers):

- `engagement`, `org_unit`, `context_pack`: participant may SELECT (metadata needed for enrolment and the prompt);
  only system writes.
- `person`, `employee`: participant sees and updates only rows whose email is the claim email; may INSERT only
  rows for the claim email (enrolment).
- `session`, `turn`, `insight`, `consent_event`, `usage_ledger`, `memory_blob`: participant reaches only rows that
  belong to an employee or person with the claim email.
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
- People GSAM invites are created ahead (bridge `invites`). When they join with the invited email, they match their
  row; the site emails them the round's link.
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
- `POST /api/interview/voice/start` — source `/api/voice/start`; 404 when `VOICE_ENABLED` is not `1`.

Public, for Deepgram only:

- `POST /api/interview/voice/think` — the OpenAI-wire think endpoint Deepgram calls. Authorised by the per-session
  voice token (hash on the session), never by a cookie.

GSAM bridge (signed, `contracts/gs-interview-v1/`): under `/api/admin/v1/interview/…`, served by the existing
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
| `VOICE_THINK_MODEL` | as the source | Haiku for voice |
| `VOICE_ENABLED` | off | kill switch: `1` turns voice on |
| `INTERVIEW_ENABLED` | off | kill switch for the whole engine on a site |
| `CHAT_RATE_SESSION_PER_MIN`, `CHAT_RATE_EMPLOYEE_PER_MIN`, `CHAT_HARD_BUDGET_RATIO`, `JOIN_RATE_*` | as the source | |

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
