// Commerce & Storefronts archetype: a storefront you can actually buy from.
//
// One engine, six purchases. Every service in this category ends with money clearing and something having
// to arrive, so the demo runs the whole way: choose, price, pay, and then show what the payment produced.
// The `grants` on the confirmation are the real differentiator between these services, which is why the
// flow does not stop at "payment successful" the way a checkout demo usually does.
//
// All arithmetic is in pence and only formatted at the edge. Member pricing, discount codes, deposits and
// instalments genuinely recompute; nothing is charged and no network call is made.
import React, { useMemo, useState } from 'react';
import { shopFor } from './shop-content.mjs';

const money = (p) => '£' + (p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MODE_LABEL = {
  full: 'Pay in full',
  deposit: 'Pay a deposit',
  instalments: 'Pay in instalments',
  subscription: 'Subscribe',
};

const keyOf = (id, vi) => id + '|' + vi;

export default function ShopDemo({ svc }) {
  const piece = shopFor(svc);
  const shop = piece && piece.shop;

  // Fixed lines (a table that must be booked before anything can be pre-ordered) start in the basket;
  // single-choice shops start on their first option. Everything else starts empty so adding is a real act.
  const initial = useMemo(() => {
    if (!shop) return {};
    const out = {};
    if (shop.single) {
      const f = shop.items[0];
      out[keyOf(f.id, 0)] = { id: f.id, vi: 0, qty: 1 };
    } else {
      shop.items.filter((i) => i.fixed).forEach((i) => { out[keyOf(i.id, 0)] = { id: i.id, vi: 0, qty: 1 }; });
    }
    return out;
  }, [shop]);

  const [lines, setLines] = useState(initial);
  const [variant, setVariant] = useState({});
  const [member, setMember] = useState(false);
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState(null);
  const [codeErr, setCodeErr] = useState('');
  const [mode, setMode] = useState(shop ? shop.pay.modes[0] : 'full');
  const [done, setDone] = useState(false);

  if (!shop) return null;

  const itemById = (id) => shop.items.find((i) => i.id === id);
  const unitOf = (item, vi) => item.price + (item.variants ? (item.variants[vi] || item.variants[0]).delta : 0);

  const add = (item) => {
    const vi = variant[item.id] || 0;
    const k = keyOf(item.id, vi);
    setLines((l) => {
      if (shop.single) return { [k]: { id: item.id, vi, qty: 1 } };
      const cur = l[k];
      const max = item.max || 10;
      return { ...l, [k]: { id: item.id, vi, qty: Math.min(max, (cur ? cur.qty : 0) + 1) } };
    });
  };
  const bump = (k, by) => setLines((l) => {
    const cur = l[k];
    if (!cur) return l;
    const item = itemById(cur.id);
    const max = item.max || 10;
    const qty = Math.max(0, Math.min(max, cur.qty + by));
    if (qty === 0) { const n = { ...l }; delete n[k]; return n; }
    return { ...l, [k]: { ...cur, qty } };
  });
  const drop = (k) => setLines((l) => { const n = { ...l }; delete n[k]; return n; });

  const submitCode = (e) => {
    e.preventDefault();
    const want = code.trim().toUpperCase();
    if (!want) return;
    const hit = shop.codes && shop.codes[want];
    if (hit) { setApplied({ ...hit, code: want }); setCodeErr(''); }
    else { setApplied(null); setCodeErr('No code called ' + want + '. Try again, or carry on without one.'); }
  };

  // ── the arithmetic, in pence ─────────────────────────────────────────────────────────────────────
  const entries = Object.entries(lines);
  const subtotal = entries.reduce((sum, [, l]) => {
    const item = itemById(l.id);
    return item ? sum + unitOf(item, l.vi) * l.qty : sum;
  }, 0);
  const memberOff = member && shop.member ? Math.round((subtotal * shop.member.pct) / 100) : 0;
  const afterMember = subtotal - memberOff;
  const codeOff = applied ? Math.round((afterMember * applied.pct) / 100) : 0;
  const total = afterMember - codeOff;

  const n = shop.pay.instalments || 3;
  // The last instalment carries the rounding, so the parts always add back to the total exactly.
  const perInstalment = Math.floor(total / n);
  const lastInstalment = total - perInstalment * (n - 1);
  const depositPct = shop.pay.depositPct || 20;
  const depositNow = Math.round((total * depositPct) / 100);

  const dueNow = mode === 'deposit' ? depositNow : mode === 'instalments' ? perInstalment : total;
  const dueLater = mode === 'deposit' ? total - depositNow : mode === 'instalments' ? total - perInstalment : 0;
  const canPay = subtotal > 0;

  if (done) {
    return (
      <div className="ssh">
        <div className="sdemo-console">
          <div className="sdemo-bar">
            <span className="sdemo-dot" aria-hidden="true" />
            <span className="sdemo-name">{shop.title}</span>
            <span className="sdemo-chan">Paid</span>
          </div>
          <div className="ssh-body">
            <div className="ssh-done" role="status">
              <span className="swd-confirm-i" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
              </span>
              <p className="swd-confirm-t">
                {mode === 'subscription' ? money(dueNow) + ' a month, live' : money(dueNow) + ' taken'}
              </p>
              <p className="swd-confirm-d">
                {mode === 'deposit' ? 'Deposit of ' + depositPct + '%. ' + money(dueLater) + ' due on the day.'
                  : mode === 'instalments' ? 'First of ' + n + '. ' + money(dueLater) + ' to follow, collected automatically.'
                  : mode === 'subscription' ? 'Renews itself until cancelled.'
                  : 'Paid in full.'}
              </p>

              {/* the part a checkout demo usually skips: what the money actually produced */}
              <p className="ssh-grants-l">And here is what that produced</p>
              <ul className="ssh-grants">
                {shop.grants.map((g) => (
                  <li key={g.t}>
                    <b>{g.t}</b>
                    <span>{g.d}</span>
                  </li>
                ))}
              </ul>

              <p className="ssh-ledger">{shop.ledger}</p>
              <button
                type="button" className="swd-btn"
                onClick={() => { setDone(false); setLines(initial); setApplied(null); setCode(''); setCodeErr(''); }}
              >
                Start again
              </button>
            </div>
          </div>
        </div>
        <p className="sdemo-privacy">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          Your storefront, your order database, your customer. No per-sale platform tax.
        </p>
      </div>
    );
  }

  return (
    <div className="ssh">
      <div className="sdemo-console">
        <div className="sdemo-bar">
          <span className="sdemo-dot" aria-hidden="true" />
          <span className="sdemo-name">{shop.title}</span>
          <span className="sdemo-chan">{shop.kicker}</span>
        </div>

        <div className="ssh-body">
          <div className="ssh-grid">
            {/* ── the catalogue ── */}
            <div className="ssh-cat">
              {shop.member ? (
                <div className="ssh-member">
                  <button
                    type="button" className={'ssh-switch' + (member ? ' is-on' : '')} aria-pressed={member}
                    onClick={() => setMember((m) => !m)}
                  >
                    <span className="ssh-switch-t" aria-hidden="true" />
                    {member ? shop.member.onLabel : shop.member.offLabel}
                  </button>
                  <span className="ssh-member-n">
                    {member ? shop.member.pct + '% member rate applied to every line' : shop.member.note}
                  </span>
                </div>
              ) : null}

              <ul className="ssh-items">
                {shop.items.map((item) => {
                  const vi = variant[item.id] || 0;
                  const inBasket = entries.filter(([, l]) => l.id === item.id).reduce((s, [, l]) => s + l.qty, 0);
                  const unit = unitOf(item, vi);
                  const shown = member && shop.member ? Math.round(unit * (1 - shop.member.pct / 100)) : unit;
                  return (
                    <li key={item.id} className={'ssh-item' + (inBasket ? ' is-in' : '')}>
                      <div className="ssh-item-main">
                        <p className="ssh-item-n">{item.name}</p>
                        <p className="ssh-item-m">{item.meta}</p>
                        {item.variants ? (
                          <label className="ssh-var">
                            <span className="gs-sr-only">Option for {item.name}</span>
                            <select
                              className="swd-ctl" value={vi}
                              onChange={(e) => setVariant((v) => ({ ...v, [item.id]: Number(e.target.value) }))}
                            >
                              {item.variants.map((v, i) => (
                                <option key={v.label} value={i}>
                                  {v.label}{v.delta ? ' (+' + money(v.delta) + ')' : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </div>
                      <div className="ssh-item-buy">
                        <span className="ssh-price">
                          {item.fixed ? 'Included' : money(shown)}
                          {member && shop.member && !item.fixed ? <s>{money(unit)}</s> : null}
                        </span>
                        {item.fixed ? (
                          <span className="ssh-fixed">In the booking</span>
                        ) : (
                          <button
                            type="button" className={'ssh-add' + (shop.single && inBasket ? ' is-on' : '')}
                            onClick={() => add(item)}
                            aria-pressed={shop.single ? inBasket > 0 : undefined}
                          >
                            {shop.single ? (inBasket ? 'Chosen' : 'Choose') : inBasket ? 'Add another' : 'Add'}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* ── the basket ── */}
            <aside className="ssh-basket" aria-label="Basket">
              <p className="ssh-basket-l">{shop.single ? 'Your choice' : 'Basket'}</p>

              {entries.length ? (
                <ul className="ssh-lines">
                  {entries.map(([k, l]) => {
                    const item = itemById(l.id);
                    if (!item) return null;
                    const unit = unitOf(item, l.vi);
                    const label = item.name + (item.variants ? ', ' + item.variants[l.vi].label : '');
                    return (
                      <li key={k} className="ssh-line">
                        <span className="ssh-line-n">{label}</span>
                        <span className="ssh-line-c">
                          {item.fixed || shop.single ? (
                            <span className="ssh-qty-s">{item.fixed ? '1' : ''}</span>
                          ) : (
                            <>
                              <button type="button" className="ssh-step" onClick={() => bump(k, -1)} aria-label={'One fewer ' + label}>−</button>
                              <span className="ssh-qty" aria-label={l.qty + ' of ' + label}>{l.qty}</span>
                              <button type="button" className="ssh-step" onClick={() => bump(k, 1)} aria-label={'One more ' + label}>+</button>
                            </>
                          )}
                          <span className="ssh-line-p">{money(unit * l.qty)}</span>
                          {!item.fixed && !shop.single ? (
                            <button type="button" className="ssh-rm" onClick={() => drop(k)} aria-label={'Remove ' + label}>×</button>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="swd-empty">Nothing chosen yet. Add {shop.itemNoun} on the left.</p>
              )}

              {shop.codes ? (
                <form className="ssh-code" onSubmit={submitCode}>
                  <label className="gs-sr-only" htmlFor="ssh-code">Discount code</label>
                  <input
                    id="ssh-code" className="swd-ctl" value={code} placeholder="Discount code" autoComplete="off"
                    spellCheck="false" aria-invalid={!!codeErr}
                    aria-describedby={codeErr ? 'ssh-code-e' : undefined}
                    onChange={(e) => { setCode(e.target.value); setCodeErr(''); }}
                  />
                  <button type="submit" className="ssh-apply">Apply</button>
                  {codeErr ? <p className="swd-err" id="ssh-code-e">{codeErr}</p> : null}
                </form>
              ) : null}

              <dl className="ssh-sums" aria-live="polite">
                <div><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div>
                {memberOff ? <div className="is-off"><dt>{shop.member.onLabel} rate, {shop.member.pct}%</dt><dd>−{money(memberOff)}</dd></div> : null}
                {codeOff ? <div className="is-off"><dt>{applied.label}</dt><dd>−{money(codeOff)}</dd></div> : null}
                <div className="is-total"><dt>Total</dt><dd>{money(total)}</dd></div>
              </dl>

              {shop.pay.modes.length > 1 ? (
                <fieldset className="ssh-modes">
                  <legend className="ssh-basket-l">How to pay</legend>
                  {shop.pay.modes.map((m) => (
                    <label key={m} className={'swd-radio' + (mode === m ? ' is-on' : '')}>
                      <input type="radio" name="ssh-mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                      {MODE_LABEL[m]}
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <p className="ssh-due" aria-live="polite">
                <b>{money(dueNow)}</b>
                <span>
                  {mode === 'deposit' ? 'due now, ' + money(dueLater) + ' later'
                    : mode === 'instalments' ? 'today, then ' + (n - 1) + ' more (last one ' + money(lastInstalment) + ')'
                    : mode === 'subscription' ? 'a ' + shop.pay.period + ', renewing'
                    : 'due now'}
                </span>
              </p>

              <button type="button" className="swd-btn ssh-pay" disabled={!canPay} onClick={() => setDone(true)}>
                {mode === 'subscription' ? 'Start membership' : 'Pay ' + money(dueNow)}
              </button>
              <p className="ssh-safe">Nothing is charged. No card field, no Stripe call.</p>
            </aside>
          </div>
        </div>
      </div>

      <p className="sdemo-privacy">
        <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Your storefront, your order database, your customer. No per-sale platform tax.
      </p>
    </div>
  );
}
