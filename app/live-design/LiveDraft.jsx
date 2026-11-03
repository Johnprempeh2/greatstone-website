'use client';
// The browser half of /live-design: binds to GSAM with the editor frame's hello (frame-protocol.mjs),
// then renders each draft GSAM sends with the engine's own HTML renderer, islands included.
import { useEffect, useRef, useState } from 'react';
import HtmlPage from '../HtmlPage.jsx';
import { envelope, validHello, validMessage } from '../../next-proof/frame-protocol.mjs';

const text = (value, max) => (typeof value === 'string' && value.length <= max ? value : null);

/** A draft from GSAM: the page's own html/css, optional shared parts and stylesheet. Anything else is refused. */
export function readDraft(payload) {
  const page = payload?.page;
  const html = text(page?.html, 2_000_000), css = text(page?.css ?? '', 1_000_000);
  if (html === null || css === null) return null;
  const chrome = payload.chrome && typeof payload.chrome === 'object' ? Object.fromEntries(['header', 'nav', 'footer'].map((key) => [key, {
    html: text(payload.chrome[key]?.html ?? '', 500_000) ?? '', css: text(payload.chrome[key]?.css ?? '', 500_000) ?? '',
  }])) : null;
  return {
    page: { html, css, path: text(page.path, 500) || '/', slug: text(page.slug, 500) || '/', title: text(page.title, 300) || '', seo: {} },
    chrome, stylesheet: text(payload.stylesheet, 2_000_000),
  };
}

export default function LiveDraft({ base, siteId, origins }) {
  const bound = useRef(null);
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    const onMessage = (event) => {
      const hello = validHello(event, origins, siteId, bound.current);
      if (hello?.payload && !hello.refused) {
        bound.current = { origin: event.origin, nonce: hello.payload.nonce };
        window.parent.postMessage(envelope('live-ready', { siteId }, bound.current), event.origin);
        return;
      }
      if (!validMessage(event, bound.current, ['live-draft'])) return;
      const next = readDraft(event.data.payload);
      if (next) setDraft(next);
    };
    window.addEventListener('message', onMessage);
    // GSAM may have said hello before this listener was ready: ask it to say it again.
    for (const origin of origins) window.parent.postMessage(envelope('live-waiting', { siteId }), origin);
    return () => window.removeEventListener('message', onMessage);
  }, [origins, siteId]);

  if (!draft) return <p style={{ padding: 24, fontFamily: 'system-ui', color: '#9ca29b' }}>Waiting for GSAM to send the page…</p>;
  const release = { ...base, chrome: draft.chrome ?? base.chrome, stylesheet: draft.stylesheet ?? base.stylesheet, pages: base.pages };
  return <HtmlPage page={draft.page} release={release} />;
}
