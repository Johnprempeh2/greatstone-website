# GRE-2608 basket review

These are local Vite screenshots at 1440 by 900 and 375 by 812. The basket items are synthetic fixtures. No production data or payment key was loaded into the browser.

The `before-` images were captured from `origin/main` before this change. They show the separate tool basket and service inquiry drawer. The `tools-`, `services-` and `mixed-` images show the shared basket after the change. The `-bottom` images show the form and payment controls after scrolling the drawer.

The `mixed-review-` images show the revised panels, line chips and payment action at phone and desktop sizes. The `cancelled-` images show the basket after a simulated return from Stripe with the quote reference already saved. The `confirmation-` images show the paid and quoted lines on the confirmation route. These six images use synthetic local basket data and a fixture Stripe session ID. They demonstrate the UI states, not proof of a completed payment or inbox delivery. The local browser check submitted the quote-only action after cancellation and observed zero new enquiry requests.

The `cancelled-review-phone.png` and `confirmation-review-phone.png` images show Mikey's second review corrections. The cancelled basket recognises the stored quote, hides the contact form and duplicate quote action, and offers a card retry. The confirmation places the order reference under Paid now and has one discovery call action. These also use synthetic local state. The browser check verified that the duplicate form and action are absent.

## Connected staging preview check, 26 October 2026

The `connected-` images came from the `gre-2608-pr128` staging draft at `fdd98ba`, backed by the test database branch and Stripe sandbox. They use only synthetic catalogue fixtures and test contacts. The tool and mixed Stripe screens each show **£172.80** (£144.00 tool plus £28.80 VAT); the service-only flow has no Stripe step. The tool and mixed confirmation images followed completed 4242 test-card payments. The service-only confirmation followed a submitted quote request. The mixed quote was recorded before the Stripe redirect and included both basket lines and its Checkout Session reference.

The preview database contains the service-only and mixed enquiries. It has **no order row** for the completed test payments, so webhook delivery to this draft remains unverified and is a merge blocker. The catalogue service was also labelled `tool` in the structured enquiry; the source fix is included after these screenshots and needs a fresh preview check. These screenshots prove the browser flows at `fdd98ba`, not webhook completion or the later source fix.

This visual check confirms the three layouts. A separate local browser interaction used mocked API responses: services only called the enquiry endpoint; mixed called Stripe and then enquiry once. The server tests and a real Stripe test mode Checkout Session check cover the payment request path. The webhook links a paid order to the earlier enquiry. A completed card payment and an enquiry in the team inbox still need a connected preview check.
