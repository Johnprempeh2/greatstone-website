'use client';

// GRE-3777: the browser islands of schema 2 (HTML) pages. Each one reuses the component the block site
// already runs, configured only by the props next-proof/islands.mjs accepted from the page HTML.
import { useEffect, useRef, useState } from 'react';
import { InquiryToggle } from '../src/store/BasketServiceControls.jsx';
import StoreCart from '../src/store/StoreCart.jsx';
import { useCart, openCart } from '../src/store/cart.mjs';
import { getSession, onAuth } from '../src/store/customerAuth.mjs';
import { StoneSymbol, css as heroCss } from '../src/blocks/Hero.jsx';
import { ContainedMotion, css as containedMotionCss } from '../src/blocks/ContainedMotion.jsx';
import { createMotionCoordinator } from '../next-proof/motion-runtime.mjs';

export const islandCss = `
.gs-island-quote{display:flex;flex-wrap:wrap;align-items:center;gap:12px}
.gs-island-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:999px;
  border:1px solid transparent;background:var(--gs-accent,#c8ff00);color:#0e1611;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}
.gs-island-btn--ghost{background:transparent;border-color:rgba(200,255,0,.35);color:inherit}
.gs-island-btn:focus-visible,.gs-island-link:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.gs-island-link{color:inherit;font-weight:700;text-underline-offset:4px}
.gs-island-stone{display:block;width:100%;max-width:520px;margin-inline:auto}
.gs-island-stone--accent{display:inline-block;width:auto;max-width:none;margin:0}
.gs-island-stone .b-hero-stone{display:block}
.gs-island-animation{position:relative;isolation:isolate;overflow:hidden;min-height:320px;border-radius:16px}
.gs-island-animation .gs-contained-motion{mask-image:none}
`;

// One basket drawer serves every quote island on the page; the first island mounted owns it.
let cartOwner = null;

// Adds the named service to the basket (when the page names one) and opens the basket, where the
// visitor sends the quote request. The request goes through the basket's existing /api/service-inquiry path.
export function QuoteIsland({ service, serviceName }) {
  const owner = useRef({});
  const [ownsCart, setOwnsCart] = useState(false);
  const quoted = useCart().filter((line) => line.kind === 'service' || !Number.isInteger(line.unitMinor) || line.unitMinor <= 0).length;
  useEffect(() => {
    if (cartOwner) return undefined;
    cartOwner = owner.current;
    setOwnsCart(true);
    return () => { if (cartOwner === owner.current) cartOwner = null; };
  }, []);
  return <div className="gs-island-quote"><style>{islandCss}</style>
    {service && serviceName ? <InquiryToggle service={{ slug: service, name: serviceName }} size="lg" onAdded={openCart} /> : null}
    <button type="button" className="gs-island-btn" onClick={openCart}>{quoted ? `Review quote (${quoted})` : 'Request a quote'}</button>
    {ownsCart ? <StoreCart /> : null}
  </div>;
}

// A link to the account page: "Sign in" until the browser has a session, then "My account".
export function AccountEntry({ look = 'button' }) {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    getSession().then((session) => { if (active) setSignedIn(Boolean(session)); }).catch(() => {});
    const { data } = onAuth((session) => setSignedIn(Boolean(session)));
    return () => { active = false; data?.subscription?.unsubscribe?.(); };
  }, []);
  return <><style>{islandCss}</style>
    <a className={look === 'link' ? 'gs-island-link' : 'gs-island-btn gs-island-btn--ghost'} href="/account">{signedIn ? 'My account' : 'Sign in'}</a></>;
}

// The 3D stone. The still paints first, phones included; Hero's StoneSymbol loads the renderer on capable
// desktops only, and never with reduced motion or Save-Data.
export function StoneIsland({ size = 'hero' }) {
  return <><style>{heroCss + islandCss}</style>
    <span className={`gs-island-stone gs-island-stone--${size}`}><StoneSymbol kind={size === 'accent' ? 'accent' : 'hero'} /></span></>;
}

// A decorative background animation in its own box. The shared motion coordinator decides still or
// animate (visible winner, reduced motion, phones, Save-Data), as it does for blocks.
let motionCoordinator;
let motionUsers = 0;
export function AnimationIsland({ effect = 'haze', intensity = 'subtle', speed = 'slow', colour = 'emerald' }) {
  const node = useRef(null);
  const [mode, setMode] = useState('still');
  useEffect(() => {
    if (!node.current) return undefined;
    motionCoordinator ||= createMotionCoordinator();
    motionUsers++;
    const unregister = motionCoordinator.register(node.current, intensity, setMode);
    return () => { unregister(); if (--motionUsers === 0) { motionCoordinator.destroy(); motionCoordinator = undefined; } };
  }, [intensity]);
  return <><style>{containedMotionCss + islandCss}</style>
    <div ref={node} className="gs-island-animation" aria-hidden="true">
      <ContainedMotion effect={`bg.${effect}`} intensity={intensity} mode={mode} speed={speed} colour={colour} />
    </div></>;
}
