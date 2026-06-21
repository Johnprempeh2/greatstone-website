# OrgDashboard (#org) — functional fixes

> **STATUS (21 Jun):** Items **#1 and #2 APPLIED** in commit `0c2ee23` (browser-verified on `#org` as the
> Ethical Quest company admin). Item **#3 remains — intentionally deferred** (latent, low-priority). The
> blocking parallel-session WIP was committed (`78616ba`), unblocking the file.

These three items came out of the functional audit of the customer org hub. They had been **blocked**
only because `src/store/OrgDashboard.jsx` was carrying another session's uncommitted changes —
editing it would have swept their work.

Anchored to **code strings** (not line numbers) so they survive line shifts. Verified still-open
against the working tree on 2026-06-21.

---

## 1. "Orders" stat counts cancelled/refunded — inconsistent with "Invested" and #account

The `Invested` stat already excludes cancelled/refunded orders, but `Orders` counts the raw list, so a
company that cancelled an order shows e.g. "3 Orders / £X invested" where X covers only 2. The #account
page was already fixed to use a `liveOrders` count (commit `d4cc2d6`); mirror it here.

**Find** (the totalSpent definition):
```js
  const totalSpent = (orders || []).filter(o => o.status !== 'cancelled' && o.status !== 'refunded').reduce((s, o) => s + (o.total_minor || 0), 0);
```
**Replace with:**
```js
  const liveOrders = (orders || []).filter(o => o.status !== 'cancelled' && o.status !== 'refunded');
  const totalSpent = liveOrders.reduce((s, o) => s + (o.total_minor || 0), 0);
```

**Find** (the Orders stat):
```jsx
        <Stat label="Orders" value={orders ? orders.length : '…'} />
```
**Replace with:**
```jsx
        <Stat label="Orders" value={orders ? liveOrders.length : '…'} />
```

---

## 2. Over-promise copy — implies an automated invite/email flow that doesn't exist

Adding a teammate creates a `member_invite_request` that **staff handle manually**; nothing emails the
invitee automatically. The current copy ("we'll provision their portal access and email them") sets the
wrong expectation. Soften to an honest "our team will set it up."

**Find:**
```jsx
        ? <>Invite a teammate above and we'll provision their portal access and email them. To remove a member or change the company admin, </>
```
**Replace with:**
```jsx
        ? <>Invite a teammate above and our team will set up their access and be in touch. To remove a member or change the company admin, </>
```

**Find:**
```js
    onDone("Invitation requested — we'll provision access and email them.");
```
**Replace with:**
```js
    onDone("Invitation requested — our team will set up access and be in touch.");
```

(Optional, same spirit — the pending-row status `we'll provision soon` reads fine; leave or change to
`with our team` for consistency.)

---

## 3. Mixed-currency total labelled with the first order's currency — LOW PRIORITY

`fmtMoney(totalSpent, (orders[0]?.currency) || 'GBP')` sums `total_minor` across all orders and labels
with `orders[0]`'s currency. If a company ever has orders in mixed currencies, the sum is meaningless and
the label is wrong. In practice every order is GBP today, and **#account has the same simplification**, so
this is a latent issue, not a live bug. If addressed, do it in both places: sum only orders matching the
primary currency, or render a per-currency breakdown. Otherwise leave a `// single-currency assumption`
note. Not worth fixing alone.

---

When applying: edit only `OrgDashboard.jsx`, build, browser-verify the org hub stats + invite copy as a
company admin, and commit with the pathspec form (`git commit … -- src/store/OrgDashboard.jsx`) per the
shared-repo hazard.
