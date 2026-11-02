'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Header from '../src/Header.jsx';
import Footer from '../src/Footer.jsx';
import CommandPalette from '../src/cms/CommandPalette.jsx';
import { publicNavOrder } from '../src/lib/nav-order.js';

const cookieSettings = !!process.env.NEXT_PUBLIC_GTM_ID;

// The studio's header and footer on the Next site: same components, same data, real paths.
function useChrome({ order, paths }) {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const current = order.find((slug) => paths[slug] === pathname) || null;
  const hrefFor = (slug) => paths[slug] || '/';
  const go = (href) => router.push(href);
  return { current, pathname, hrefFor, go, onNavigate: (slug) => go(hrefFor(slug)) };
}

export function SiteHeader({ order, pages, paths, navigation, settings }) {
  const { current, pathname, hrefFor, go, onNavigate } = useChrome({ order, paths });
  const [cmdOpen, setCmdOpen] = useState(false);
  useEffect(() => {
    const onKey = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen((open) => !open); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  // The palette is the site's search: the same public pages as the header and footer, plus the
  // storefront and account routes, as in the studio's view mode.
  const commands = useMemo(() => [
    ...publicNavOrder(order, pages, false).map((slug) => ({ id: 'go-' + slug, group: 'Go to', label: pages[slug].title, hint: slug === current ? 'current' : '', run: () => onNavigate(slug) })),
    { id: 'go-shop', group: 'Go to', label: 'Products', hint: 'storefront', run: () => go('/shop') },
    { id: 'go-account', group: 'Go to', label: 'Your account', run: () => go('/account') },
    { id: 'go-org', group: 'Go to', label: 'Your organisation', run: () => go('/org') },
  ], [order, pages, current]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} commands={commands} />
    <Header order={order} pages={pages} navigation={navigation} current={current} query="" hrefFor={hrefFor} onNavigate={onNavigate}
      onShop={() => go('/shop')} shopActive={/^\/(shop|product)(\/|$)/.test(pathname)}
      onAccount={() => go('/account')} accountActive={/^\/(account|portal)(\/|$)/.test(pathname)}
      onCommand={() => setCmdOpen(true)} canEdit={false}
      logo={settings.logo} ctaLabel={settings.headerCtaLabel} siteName={settings.siteName} />
  </>;
}

export function SiteFooter({ order, pages, paths, settings }) {
  const { hrefFor, onNavigate } = useChrome({ order, paths });
  return <Footer order={order} pages={pages} onNavigate={onNavigate} canEdit={false} hrefFor={hrefFor} cookieSettings={cookieSettings}
    logo={settings.logo} tagline={settings.footerTagline} siteName={settings.siteName} footerEmail={settings.footerEmail} legalName={settings.legalName} />;
}
