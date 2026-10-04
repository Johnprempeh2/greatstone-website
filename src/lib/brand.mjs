// Brand strings that appear across more than one surface, in one place.
//
// WHY THIS EXISTS. The tagline was written out as a literal in eleven places inside src/ alone: the
// footer's fallback, the settings default, the Site Settings panel's placeholder AND its live preview,
// the Hero block's default kicker, the document slogan, three transactional email builders, and the
// invoice document. Replacing it meant finding all eleven. Ben is supplying a new tagline, so this
// makes that a one-line edit.
//
// THE MIRRORS THIS CANNOT REACH. Three surfaces deliberately duplicate these strings and cannot import
// them, so they must be updated in the same change:
//
//   1. supabase/functions/{stripe-webhook,notify-licence-issued,send-welcome-email}/index.ts
//      Deno edge functions. They are documented mirrors of the src/lib/*-email.mjs builders precisely
//      because they cannot reach into src/. Each carries the tagline in its own HTML.
//      supabase/functions/_shared/front-door-pack.mjs copies BRAND_SIGNOFF; its test fails if they differ.
//   2. supabase/templates/_build.mjs
//      Generates the five auth email templates (confirmation, recovery, invite, magic_link,
//      email_change). Edit the generator, not the generated .html files.
//   3. Any deployed copy of the above. The edge functions need a separate deploy.
//
// Keep this list accurate: a tagline that changes in nine places and not the tenth is worse than one
// that changes nowhere, because the inconsistency is invisible until a customer sees two of them.

// The line beneath the wordmark. Ben's Architecture v2.0 retires the proposition this phrase came from,
// and his replacement has not arrived yet, so the current wording stands rather than being guessed at.
export const BRAND_TAGLINE = 'The Foundation of Digital Excellence';

export const BRAND_NAME = 'Greatstone International';

// "Greatstone International · The Foundation of Digital Excellence", the email sign-off form.
export const BRAND_SIGNOFF = `${BRAND_NAME} · ${BRAND_TAGLINE}`;

// The one primary call to action, and where it goes. Ben's Architecture v2.0 fixes the wording and John
// confirmed it for every block on 4 Oct 2026 (GRE-635), retiring "Book a Diagnostic". '#book' opens the
// booking flow (App.jsx handles it), so every block default lands the visitor on the same next step.
export const PRIMARY_CTA_LABEL = 'Begin the Conversation';
export const PRIMARY_CTA_HREF = '#book';
