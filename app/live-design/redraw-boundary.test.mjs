import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';

const window = new Window({ url: 'https://example.test/' });
Object.assign(globalThis, { window, document: window.document, HTMLElement: window.HTMLElement, Node: window.Node });
const { createElement } = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { RedrawBoundary } = await import('./redraw-boundary.mjs');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The page as React draws it: a section that changes with `n`, as an island or a new draft would.
// On the second draw React removes the section it rendered, which Impeccable has already taken away.
const Page = ({ n }) => createElement('main', null, n === 1 ? createElement('section', { id: 'logos' }, 'logos') : createElement('p', { id: 'fresh' }, `draft ${n}`));

// What Impeccable's insertVariants does: the picked element goes inside a wrapper React never saw.
function moveLikeImpeccable() {
  const el = document.getElementById('logos');
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-impeccable-variants', 'x');
  el.parentNode.replaceChild(wrapper, el);
  wrapper.appendChild(el);
  el.remove(); // accept keeps only the chosen version
}

test('a React update after Impeccable moved the page redraws it instead of blanking the frame', async () => {
  const warn = console.warn, error = console.error;
  console.warn = console.error = () => {};
  try {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const draw = (n) => act(() => root.render(createElement(RedrawBoundary, null, createElement(Page, { n }))));
    await draw(1);
    moveLikeImpeccable();
    await draw(2);
    assert.equal(host.querySelector('#fresh')?.textContent, 'draft 2', 'the page is drawn again');
  } finally {
    console.warn = warn; console.error = error;
  }
});
