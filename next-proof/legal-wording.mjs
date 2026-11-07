// GRE-3831: Harbor's consent wording for the Next site (GRE-1980 review document, revision 2,
// Mikey reviewed in GRE-1982). The live seed in src/store.js keeps the Vite text, which is true
// while Vite serves the site; the Next release export swaps these sentences in, so the new text
// goes public with the cutover and not before. Exact text only: change nothing else here.

// The public Next cutover date. Set it to the cutover day in the last content sync (GRE-2115).
export const LEGAL_UPDATED = 'Last updated 3 November 2026.';

const OLD_UPDATED = 'Last updated 6 October 2026.';

export const LEGAL_REPLACEMENTS = Object.freeze({
  '/privacy': [
    [OLD_UPDATED, LEGAL_UPDATED],
    ['If you decline, no analytics cookies are set. Google may still receive basic signals with no cookies and no identifier, such as the fact that a page loaded, which it uses to estimate overall traffic.',
      'Google Tag Manager and Google Analytics do not load until you accept analytics cookies. If you do not accept, we do not set analytics cookies.'],
    ['Google</strong> runs Tag Manager and Analytics. It sets analytics cookies only if you accept them; if you decline, it receives only the basic signals described above.',
      'Google</strong> runs Tag Manager and Analytics. They do not load until you accept analytics cookies.'],
  ],
  '/cookies': [
    [OLD_UPDATED, LEGAL_UPDATED],
    ['If you decline, or later change your mind in <strong>Cookie settings</strong>, we remove the ones we set.',
      'If you decline, or later change your mind in <strong>Cookie settings</strong>, we remove Greatstone’s optional browser storage. Google’s analytics cookies may remain until you clear them in your browser settings.'],
    ['If you decline, Google may still receive basic signals with no cookies and no identifier, which it uses to estimate overall traffic.',
      'Google Tag Manager and Google Analytics do not load until you accept analytics cookies. If you accept and later decline in Cookie settings, we withdraw permission for analytics cookies straight away. Google Tag Manager remains loaded until you reload the page; it will not load again unless you accept.'],
  ],
});

// Each old sentence must appear exactly once on its page, so a change to the live text fails the
// export instead of shipping the old wording.
export function applyLegalWording(release) {
  const pages = release.pages.map((page) => {
    const replacements = LEGAL_REPLACEMENTS[page.path];
    if (!replacements) return page;
    let text = JSON.stringify(page.data);
    for (const [from, to] of replacements) {
      const needle = JSON.stringify(from).slice(1, -1);
      const count = text.split(needle).length - 1;
      if (count !== 1) throw new Error(`GRE-3831 wording: expected one "${from.slice(0, 40)}…" on ${page.path}, found ${count}`);
      text = text.replace(needle, () => JSON.stringify(to).slice(1, -1));
    }
    return { ...page, data: JSON.parse(text) };
  });
  return { ...release, pages };
}
