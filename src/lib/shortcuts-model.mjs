// Keyboard-shortcut catalogue + search/format layer (cycle 20). Pure, read-only, STORE-FREE.
// Every chord here is GROUNDED in a real handler so the reference never lies:
//   ⌘K / ⌘S / Esc  -> the global keydown in App.jsx; ? -> the opener added this cycle;
//   ⌘Z / ⌘⇧Z       -> Puck's native history (see UndoRedo.jsx); ↑ ↓ Enter Esc -> CommandPalette.jsx.
// Token 'mod' renders ⌘ on macOS / Ctrl elsewhere; 'shift' renders ⇧ / Shift. No Date.now, no DOM, no store.

export const SHORTCUT_GROUPS = Object.freeze([
  { id: 'global', title: 'Anywhere in the studio', items: [
    { keys: ['mod', 'K'], label: 'Open the command palette', hint: 'jump to any page, block, or action' },
    { keys: ['?'], label: 'Open this shortcuts reference' },
    { keys: ['Esc'], label: 'Close the palette, a panel, or a dialog' },
  ] },
  { id: 'editor', title: 'In the page editor', items: [
    { keys: ['mod', 'S'], label: 'Publish (or request review if you cannot)' },
    { keys: ['mod', 'Z'], label: 'Undo the last change' },
    { keys: ['mod', 'shift', 'Z'], label: 'Redo the last change' },
  ] },
  { id: 'palette', title: 'In the command palette', items: [
    { keys: ['↑'], label: 'Move to the previous command' },
    { keys: ['↓'], label: 'Move to the next command' },
    { keys: ['Enter'], label: 'Run the highlighted command' },
  ] },
]);

// formatChord(['mod','shift','Z'], isMac) -> ['⌘','⇧','Z'] (mac) / ['Ctrl','Shift','Z'] (win). Pure; for <kbd> rendering.
export function formatChord(keys, isMac) {
  return (keys || []).map((k) => {
    if (k === 'mod') return isMac ? '⌘' : 'Ctrl';
    if (k === 'shift') return isMac ? '⇧' : 'Shift';
    return k;
  });
}

// chordLabel(['mod','K'], isMac) -> 'Cmd K' / 'Ctrl K' — a screen-reader-friendly spoken form (no glyphs).
export function chordLabel(keys, isMac) {
  return (keys || []).map((k) => {
    if (k === 'mod') return isMac ? 'Cmd' : 'Ctrl';
    if (k === 'shift') return 'Shift';
    if (k === '?') return 'question mark';
    if (k === '↑') return 'Up arrow';
    if (k === '↓') return 'Down arrow';
    return k;
  }).join(' ');
}

// matchShortcuts(groups, query, isMac) -> { groups:[{...,items:[...]}], total } with non-matching items + empty
// groups dropped. Query is a case-insensitive substring matched against label, hint, the rendered key glyphs
// (so 'esc'/'⌘ k' work) AND the spoken chord label (so 'cmd'/'arrow' work). Empty query returns every group.
export function matchShortcuts(groups, query, isMac = true) {
  const list = groups || [];
  const q = String(query || '').trim().toLowerCase();
  if (!q) return { groups: list, total: list.reduce((n, g) => n + g.items.length, 0) };
  const out = [];
  let total = 0;
  for (const g of list) {
    const items = g.items.filter((it) => {
      const hay = (it.label + ' ' + (it.hint || '') + ' ' + formatChord(it.keys, isMac).join(' ') + ' ' + chordLabel(it.keys, isMac)).toLowerCase();
      return hay.includes(q);
    });
    if (items.length) { out.push({ id: g.id, title: g.title, items }); total += items.length; }
  }
  return { groups: out, total };
}
