# Branded auth emails

The account-confirmation email a customer gets on sign-up was Supabase's default (plain template,
`...@mail.app.supabase.io` sender). This makes every transactional auth email look like the rest of
the store. Two layers, and they're independent:

1. **The body** (what the email looks like): done in code, in this repo.
2. **The sender** (who it comes from, and the sending limits): a one-time Supabase setting that needs
   your credentials, so it's yours to switch on.

The body customisation already improves the email on its own. The sender step is what moves it off
Supabase's shared address and rate limits onto a Greatstone from-address.

---

## 1. The body: built and version-controlled

Five branded templates live in `supabase/templates/`, on the same dark Greatstone styling as the order
email, covering every customer-facing auth email:

| File | Email | Subject |
|------|-------|---------|
| `confirmation.html` | Confirm sign-up | Confirm your Greatstone account |
| `recovery.html` | Reset password | Reset your Greatstone password |
| `magic_link.html` | Magic-link sign-in | Your Greatstone sign-in link |
| `invite.html` | Invite | You're invited to Greatstone |
| `email_change.html` | Change email | Confirm your new email address |

They're generated from one shared shell by `supabase/templates/_build.mjs` (edit the copy or styling
there, then `node supabase/templates/_build.mjs` to regenerate all five). Design choices that matter:

- **Table layout, inline styles, ~560px.** The only structure that renders consistently across Gmail,
  Outlook and Apple Mail.
- **CSS wordmark, not an image.** Mail clients routinely block remote and data-URI images, so the
  `GREATST<span>O</span>NE` mark is drawn in text and always shows. (The order email does the same.)
- **The action link appears as a tappable button and as raw text**, so it still works if a client
  strips the button.
- Lime button with dark text, British English, sentence case, the house voice.

`supabase/config.toml` now wires these in under `[auth.email.template.*]`, so anyone running the CLI
(or a config push) picks them up.

## 2. Applying the templates to the live project

Two routes. The dashboard route is zero-risk and the fastest way to see it live; the CLI route keeps
everything as code.

**A. Dashboard (recommended to start).** Supabase dashboard → Authentication → Emails → Templates.
For each of the five, paste the matching `supabase/templates/*.html` into the message body and set the
subject from the table above. Nothing else changes.

**B. CLI config push (infrastructure-as-code).** From the repo:

```
supabase link --project-ref melnjvwmayjukpyngolv
supabase config push
```

Caveat worth reading first: `config push` applies everything in `config.toml`, not just the email
blocks. If any auth setting was ever changed directly in the dashboard (site URL, redirect URLs, an
SMTP host) and isn't represented in `config.toml`, a push can reset it to the CLI default. Review the
diff the CLI prints before confirming, or just use route A for the templates.

## 3. The sender: custom SMTP via the Resend account we already use

Out of the box, Supabase sends auth emails from its own shared address and rate-limits them to a
handful per hour. The store already sends order emails through **Resend**; point Supabase's auth email
at the same account and every auth email comes from a Greatstone address with proper deliverability.

What you do once:

1. In Resend, confirm the sending domain is verified (the same one the order email uses, e.g.
   `greatstonesoftware.co.uk`, with DKIM/SPF records on the domain). Create an API key for SMTP if you
   don't have one.
2. Turn on custom SMTP in Supabase. Dashboard → Authentication → Emails → SMTP Settings, or as code in
   `config.toml`:

   ```toml
   [auth.email.smtp]
   enabled = true
   host = "smtp.resend.com"
   port = 465
   user = "resend"
   pass = "env(RESEND_SMTP_PASSWORD)"     # a Resend API key, set as a secret; never commit it
   admin_email = "dx@greatstonesoftware.co.uk"
   sender_name = "Greatstone International"
   ```

   If you go the code route, set the secret (`RESEND_SMTP_PASSWORD`) in your environment before
   `config push`; that block is deliberately left out of the committed config so no key is stored in
   git and a push can't break sending by pointing at an unset password.

That's the whole sender step. It's the one piece that needs your credentials, so I've left it to you
rather than handling a Resend API key.

## 4. One thing to decide: the sender domain

The codebase isn't consistent on the contact domain: the live site footer and the order email's
`RESEND_FROM` example use **greatstonesoftware.co.uk**, while a couple of older strings use
**greatstoneinternational.co.uk**. Pick one as the canonical sending + contact domain (whichever is
verified in Resend), and we'll align the footer, the invoice contact line and these emails to it in a
follow-up. The templates above don't hardcode an email address, so they're unaffected either way.

## 5. Testing

After applying: from a throwaway address, create an account (confirmation), and run a password reset
(recovery). Check the email renders in at least Gmail web + an iOS/Apple Mail client, the button works,
and the sender shows the Greatstone address once SMTP is on.
