# GRE-2284 account sign-in browser check

The `before` captures are from the existing staging site. The `after` captures are from local `npm run dev` with the staging site's public Supabase browser settings. Both show the unchanged sign-in form at 1440 px and 390 px. No account details are pictured.

In Chromium, the staging sign-in password field reported `minLength = 8`; the local branch reported `-1`. The browser accepted the existing five-character demo password, submitted the form, and loaded the customer account tabs. Account creation still reported `minLength = 8` at both widths. The local `/api/customer-store` requests were routed to the staging endpoint for this check. The fixture account was not changed, and nothing was deployed.
