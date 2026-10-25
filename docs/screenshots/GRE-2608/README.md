# GRE-2608 basket review

These are local Vite screenshots at 1440 by 900 and 375 by 812. The basket items are synthetic fixtures. No production data or payment key was loaded into the browser.

The `before-` images were captured from `origin/main` before this change. They show the separate tool basket and service inquiry drawer. The `tools-`, `services-` and `mixed-` images show the shared basket after the change. The `-bottom` images show the form and payment controls after scrolling the drawer.

This visual check confirms the three layouts. A separate local browser interaction used mocked API responses: services only called the enquiry endpoint; mixed called Stripe and then enquiry once. The server tests and a real Stripe test mode Checkout Session check cover the payment request path. The webhook links a paid order to the earlier enquiry. A completed card payment and an enquiry in the team inbox still need a connected preview check.
