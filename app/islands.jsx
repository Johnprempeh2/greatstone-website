'use client';

// GRE-3777: the browser islands of schema 2 (HTML) pages. Each one reuses the component the block site
// already runs, configured only by the props next-proof/islands.mjs accepted from the page HTML.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { InquiryToggle, InquiryBar } from '../src/store/BasketServiceControls.jsx';
import { ServiceShelf, serviceShelfCss, CategoryMedia, CatalogueBackdrop } from '../src/store/ServiceShelf.jsx';
import StoreCart from '../src/store/StoreCart.jsx';
import { useCart, openCart } from '../src/store/cart.mjs';
import { getSession, onAuth } from '../src/store/customerAuth.mjs';
import { StoneSymbol, css as heroCss } from '../src/blocks/Hero.jsx';
import { ContainedMotion, css as containedMotionCss } from '../src/blocks/ContainedMotion.jsx';
import { createMotionCoordinator } from '../next-proof/motion-runtime.mjs';
import { UserIcon } from '../src/Header.jsx';
import { Search } from '../src/blocks/icons.jsx';
import CommandPalette from '../src/cms/CommandPalette.jsx';

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
    {ownsCart ? <div className="st-v15"><StoreCart /></div> : null}
  </div>;
}

// GRE-6446 (John, 27 Nov): one Transformation Services category's services, each with Add to basket, behind
// a "See the N services" button. The page places one per category card; the server passes that category's
// services (the published Services collection, else src/data/service-catalog.mjs; no prices). The first one
// mounted owns the basket drawer and the "N services in your basket" bar; the basket sends one enquiry.
// John, 28 Nov: laid out like the earlier catalogue with its prototypes (src/store/ServiceShelf.jsx); later that
// day, the home page's tide behind liquid glass cards, and a photo on each category.
export const serviceBasketCss = `
.gs-svc-bar{position:fixed;left:16px;right:96px;bottom:16px;z-index:40;max-width:720px;margin:0 auto}
.gs-svc-bar .inq-bar{margin:0;padding:14px 20px;border:1px solid rgba(200,255,0,.45);border-radius:14px;background:#121713}
@media(max-width:700px){.gs-svc-bar{left:12px;right:84px}}
`;

export function ServiceBasketIsland({ category, services = [] }) {
  const owner = useRef({});
  const [ownsCart, setOwnsCart] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!cartOwner) { cartOwner = owner.current; setOwnsCart(true); }
    // A link to the category (the header's /transformation-services#websites) opens it.
    const fromHash = () => { if (decodeURIComponent(window.location.hash.slice(1)) === category) setOpen(true); };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => { window.removeEventListener('hashchange', fromHash); if (cartOwner === owner.current) cartOwner = null; };
  }, [category]);
  if (!services.length) return null;
  return <><style>{serviceShelfCss}</style>
    <CategoryMedia id={category} />
    <ServiceShelf id={category} services={services} open={open} onToggle={() => setOpen((was) => !was)} />
    {/* The page region contains its layout, so fixed parts (bar, basket button, drawer) live on the body. */}
    {ownsCart ? <CatalogueBackdrop /> : null}
    {ownsCart ? createPortal(<><style>{serviceBasketCss}</style><div className="gs-svc-bar"><InquiryBar /></div><StoreCart /></>, document.body) : null}
  </>;
}

// A link to the account page: "Sign in" until the browser has a session, then "My account".
export function AccountEntry({ look = 'button' }) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    getSession().then((session) => { if (active) setSignedIn(Boolean(session)); }).catch(() => {});
    const { data } = onAuth((session) => setSignedIn(Boolean(session)));
    return () => { active = false; data?.subscription?.unsubscribe?.(); };
  }, []);
  // GRE-3862: the studio header's account button, with its own labels. A button, as in the header, so it
  // keeps the header's look.
  if (look === 'header') {
    const label = signedIn ? 'Account' : 'Sign in';
    return <button type="button" className="gs-accountbtn" onClick={() => router.push('/account')} aria-label={label} title={label}><UserIcon /><span className="gs-accountlabel">{label}</span></button>;
  }
  return <><style>{islandCss}</style>
    <a className={look === 'link' ? 'gs-island-link' : 'gs-island-btn gs-island-btn--ghost'} href="/account">{signedIn ? 'My account' : 'Sign in'}</a></>;
}

// GRE-3862: the studio header's search: the ⌘K button and the command palette over the site's public
// pages (`links`, from the release) plus the storefront and account routes, as in SiteShell. The palette
// opens on the document body, outside the header's contained box, so it covers the screen as today.
export function SiteSearch({ links = [] }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setOpen((value) => !value); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  const commands = useMemo(() => [
    ...links.map((link) => ({ id: `go-${link.href}`, group: 'Go to', label: link.label, hint: link.href === pathname ? 'current' : '', run: () => router.push(link.href) })),
    { id: 'go-shop', group: 'Go to', label: 'Products', hint: 'storefront', run: () => router.push('/shop') },
    { id: 'go-account', group: 'Go to', label: 'Your account', run: () => router.push('/account') },
    { id: 'go-org', group: 'Go to', label: 'Your organisation', run: () => router.push('/org') },
  ], [links, pathname, router]);
  return <>
    <button type="button" className="gs-cmdbtn" onClick={() => setOpen(true)} title="Command palette (⌘K)" aria-label="Search and commands"><Search /><kbd>⌘K</kbd></button>
    {open && createPortal(<CommandPalette open={open} onClose={() => setOpen(false)} commands={commands} placeholder="Search pages" label="Search the site" />, document.body)}
  </>;
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
