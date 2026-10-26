# GRE-2608 basket review

These are local Vite screenshots at 1440 by 900 and 375 by 812. The basket items are synthetic fixtures. No production data or payment key was loaded into the browser.

The `before-` images were captured from `origin/main` before this change. They show the separate tool basket and service inquiry drawer. The `tools-`, `services-` and `mixed-` images show the shared basket after the change. The `-bottom` images show the form and payment controls after scrolling the drawer.

The `mixed-review-` images show the revised panels, line chips and payment action at phone and desktop sizes. The `cancelled-` images show the basket after a simulated return from Stripe with the quote reference already saved. The `confirmation-` images show the paid and quoted lines on the confirmation route. These six images use synthetic local basket data and a fixture Stripe session ID. They demonstrate the UI states, not proof of a completed payment or inbox delivery. The local browser check submitted the quote-only action after cancellation and observed zero new enquiry requests.

The `cancelled-review-phone.png` and `confirmation-review-phone.png` images show Mikey's second review corrections. The cancelled basket recognises the stored quote, hides the contact form and duplicate quote action, and offers a card retry. The confirmation places the order reference under Paid now and has one discovery call action. These also use synthetic local state. The browser check verified that the duplicate form and action are absent.

This visual check confirms the three layouts. A separate local browser interaction used mocked API responses: services only called the enquiry endpoint; mixed called Stripe and then enquiry once. The server tests and a real Stripe test mode Checkout Session check cover the payment request path. The webhook links a paid order to the earlier enquiry. A completed card payment and an enquiry in the team inbox still need a connected preview check.
