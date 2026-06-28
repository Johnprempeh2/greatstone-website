// Pure semantic diff of two page snapshots — the `data` object the store snapshots on publish
// ({ root:{ props:{ title } }, content:[ { type, props:{ id, …fields } } ] }). Read-only: no React,
// no store, no DOM. Blocks are keyed by their STABLE props.id (the same id duplicatePage remaps), so a
// reorder reads as MOVED rather than a mass rewrite, and an edited block is matched to its old self.
// A snapshot carries `data` only — NOT the 3D background (page.background) or SEO (page.seo) — so a
// "no content changes" result can still hide a background/SEO change; the panel says so.

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  const aArr = Array.isArray(a), bArr = Array.isArray(b);
  if (aArr !== bArr) return false;
  if (aArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

const contentOf = (data) => (data && Array.isArray(data.content)) ? data.content : [];
const titleOf = (data) => (data && data.root && data.root.props && data.root.props.title) || '';
// real props.id, or a positional fallback so legacy id-less blocks never crash the diff (low confidence).
const keyOf = (b, i) => (b && b.props && b.props.id != null) ? b.props.id : '@idx-' + i;
const typeOf = (b) => (b && b.type) || 'Block';

// the ids that keep their relative order across the two sequences (longest common subsequence); any
// common id NOT in this set genuinely moved. Both inputs are sequences over the same id set.
function lcsKeep(a, b) {
  const n = a.length, m = b.length;
  if (!n || !m) return new Set();
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const keep = new Set();
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { keep.add(a[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return keep;
}

// One-level field diff between two prop bags (skips id). Compared BY VALUE (contentEditable fills most
// props with strings, so reference compare would churn); arrays are summarised ("N items edited" / a
// count change) and nested objects capped, never dumped as raw JSON.
export function diffProps(fromProps = {}, toProps = {}) {
  const from = fromProps || {}, to = toProps || {};
  const fields = [];
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  keys.forEach((k) => {
    if (k === 'id') return;
    const a = from[k], b = to[k];
    if (deepEqual(a, b)) return;
    if (Array.isArray(a) || Array.isArray(b)) {
      const fa = Array.isArray(a) ? a : [], fb = Array.isArray(b) ? b : [];
      let summary;
      if (fa.length !== fb.length) summary = fb.length + ' item' + (fb.length === 1 ? '' : 's') + ' (was ' + fa.length + ')';
      else {
        let edited = 0;
        for (let i = 0; i < fb.length; i++) if (!deepEqual(fa[i], fb[i])) edited++;
        summary = edited + ' item' + (edited === 1 ? '' : 's') + ' edited';
      }
      fields.push({ path: k, kind: 'array', summary });
    } else if (a != null && b != null && typeof a === 'object' && typeof b === 'object') {
      fields.push({ path: k, kind: 'object', summary: 'changed' });
    } else {
      const empty = (x) => x === undefined || x === null || x === '';
      const kind = empty(a) ? 'added' : empty(b) ? 'cleared' : 'changed';
      fields.push({ path: k, kind, summary: kind });
    }
  });
  return fields;
}

// Diff two snapshot `data` objects (fromData → toData). Returns grouped, serialisable buckets + counts.
export function diffVersions(fromData, toData) {
  const fromC = contentOf(fromData), toC = contentOf(toData);
  const fromMap = new Map(); fromC.forEach((b, i) => fromMap.set(keyOf(b, i), b));
  const toMap = new Map(); toC.forEach((b, i) => toMap.set(keyOf(b, i), b));

  const added = [], removed = [], changed = [];
  toC.forEach((b, i) => {
    const k = keyOf(b, i);
    if (!fromMap.has(k)) { added.push({ id: k, type: typeOf(b) }); return; }
    const fields = diffProps(fromMap.get(k).props, b.props);
    if (fields.length) changed.push({ id: k, type: typeOf(b), fields });
  });
  fromC.forEach((b, i) => { const k = keyOf(b, i); if (!toMap.has(k)) removed.push({ id: k, type: typeOf(b) }); });

  const commonFrom = fromC.map((b, i) => keyOf(b, i)).filter((k) => toMap.has(k));
  const commonTo = toC.map((b, i) => keyOf(b, i)).filter((k) => fromMap.has(k));
  const keep = lcsKeep(commonFrom, commonTo);
  const moved = commonTo.filter((k) => !keep.has(k)).map((k) => ({ id: k, type: typeOf(toMap.get(k)) }));

  const ft = titleOf(fromData), tt = titleOf(toData);
  const titleChanged = ft !== tt ? { from: ft, to: tt } : null;
  const counts = { added: added.length, removed: removed.length, moved: moved.length, changed: changed.length };
  counts.total = counts.added + counts.removed + counts.moved + counts.changed + (titleChanged ? 1 : 0);
  return { titleChanged, added, removed, moved, changed, counts };
}
