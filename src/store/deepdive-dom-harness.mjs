// Build a scrap of JSX and run it against a DOM stand-in, then put the globals back.
//
// ⚠ THIS EXISTED TWICE BEFORE IT EXISTED ONCE. The render test and the client-view harness each
// carried their own copy of the same forty lines, and the second copy only got the "save the FIRST
// descriptor" fix because somebody remembered to carry the comment across. A third copy was about
// to be written for the portal bar. The machinery is the same every time: esbuild the entry,
// mirror the globals happy-dom needs (this codebase writes bare `addEventListener(...)`, which is
// correct in a browser and undefined under node), import it, restore.
import { build } from 'esbuild';
import { Window } from 'happy-dom';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const KEYS = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event',
  'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'SVGElement',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'matchMedia', 'location',
  'history', 'localStorage', 'sessionStorage', 'DOMParser', 'Image', 'Blob', 'FileReader',
  'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'HTMLInputElement', 'HTMLTextAreaElement',
  'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLButtonElement', 'NodeFilter', 'Range'];

/** Bundle `source` as a browser module, run its `run` export under happy-dom, hand back what it
 *  returned. `prefix` only names the temp directory, so a failing run is findable. */
export async function runInDom(source, prefix = 'ddprobe') {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  const outfile = join(dir, 'entry.mjs');
  await build({
    stdin: { contents: source, resolveDir: ROOT, loader: 'jsx' },
    bundle: true, format: 'esm', outfile, platform: 'browser', jsx: 'automatic',
    logLevel: 'silent', define: { 'process.env.NODE_ENV': '"development"' },
    loader: { '.svg': 'text', '.css': 'empty' },
  });

  const win = new Window({ url: 'http://localhost/' });
  const g = globalThis;
  const saved = new Map();
  // ⚠ Save the FIRST descriptor only, or the restore reinstalls happy-dom instead of removing it.
  const put = (k, v) => {
    if (!saved.has(k)) saved.set(k, Object.getOwnPropertyDescriptor(g, k));
    Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
  };
  for (const k of KEYS) {
    if (win[k] === undefined) continue;
    put(k, typeof win[k] === 'function' && /^(add|remove|dispatch)/.test(k) ? win[k].bind(win) : win[k]);
  }

  try {
    const mod = await import(`${outfile}?t=${dir}`);
    // ⚠ `return await`, NOT `return`. With a bare return the promise leaves the try block before it
    // settles, so the finally below tears the globals down while an ASYNC `run()` is still using
    // them: the entry then fails with "window is not defined" in a harness that had installed
    // window perfectly well. The first caller's run() was synchronous, which is why this sat here
    // unnoticed until something needed to await inside the page.
    return await mod.run();
  } finally {
    // ⚠ CLOSE THE WINDOW, or its timers outlive the test. happy-dom keeps its own timer registry
    // and its handles have no `.unref`, so the portal's one-second session clock kept the process
    // alive after the assertions had finished and `node --test` simply hung. A component that
    // ticks is a normal thing to want to test; a harness that cannot be shut down is not.
    try { win.happyDOM?.abort?.(); win.close?.(); } catch { /* already gone */ }
    for (const [k, d] of saved) { if (d) Object.defineProperty(g, k, d); else delete g[k]; }
    rmSync(dir, { recursive: true, force: true });
  }
}
