import { walkText, stripMarks, fieldLabel, buildSnippet } from './content-search.mjs';

// Greatstone "Copy coach": a pure, read-only check of every page's prose against the house voice — banned
// filler / AI-tell words, em-dashes (the hard rule), the "not just X, it's Y" tic, "whilst", and a few
// metaphor clichés. Advisory: it flags wording with a why + a suggested direction; it never rewrites.
// Reuses content-search's prose walker so the coach and search see the EXACT same editor-visible text.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// case-insensitive, word-boundary alternation over a literal list (collects all hits, global).
const wordRe = (list) => new RegExp('\\b(' + list.map(esc).join('|') + ')\\b', 'gi');
// whole-phrase alternation; apostrophes match both straight ' and curly ’.
const phraseRe = (list) => new RegExp('(' + list.map((p) => esc(p).replace(/'/g, "['’]")).join('|') + ')', 'gi');

// Banned filler / AI-tell words (literal, word-boundary). Metaphor-only words (navigate / journey /
// landscape / ecosystem / texture / tapestry / fabric) are deliberately NOT here — they run through the
// collocation rules below so a literal "navigate to the page" / "river landscape" is never nagged.
const BANNED = ['delve', 'leverage', 'robust', 'robustly', 'holistic', 'holistically', 'synergy', 'paradigm', 'streamline', 'unlock', 'empower', 'cutting-edge', 'best-in-class', 'world-class', 'game-changer', 'game-changing', 'transformative', 'revolutionary', 'seamless', 'seamlessly'];
const SUGGEST = {
  leverage: "use 'use'", delve: "say 'look at' / 'go into'", robust: 'name the real quality (reliable, tested, proven)',
  holistic: 'be specific about what it covers', synergy: 'say what actually combines', streamline: "use 'simplify' / 'speed up'",
  unlock: "use 'enable' / 'open up'", empower: "use 'let' / 'give … the ability to'", seamless: 'describe the actual experience',
  transformative: 'state the concrete change', revolutionary: 'state what is genuinely new', 'game-changer': 'name the specific impact',
};
const PHRASES = ["in today's fast-paced world", 'in an era of', 'now more than ever', 'in the age of ai', 'at its core', 'at the end of the day', 'when all is said and done', 'certainly!', 'absolutely!', 'great question!', "i'd be happy to"];

const RULES = [
  // HARD rule: only the real em-dash (U+2014). NOT the en-dash (U+2013, used in number/date ranges) and
  // NOT the hyphen-minus (U+002D, in "best-in-class", "Obsidian-Lime", "co-founder") — those never trip this.
  { id: 'em-dash', label: 'Em-dash', severity: 'hard', suggestion: 'replace with a comma, full stop, or parentheses', re: /—/g },
  { id: 'banned', label: 'Banned filler', severity: 'flag', re: wordRe(BANNED), suggest: (m) => SUGGEST[m.toLowerCase()] || 'cut it, or name the specific thing' },
  { id: 'phrase', label: 'Filler phrase', severity: 'flag', suggestion: 'cut it — open with the point', re: phraseRe(PHRASES) },
  { id: 'not-just', label: '“Not just X, it’s Y” tic', severity: 'flag', suggestion: 'state the value plainly (keep this construction to at most once per page)', re: /\bnot just\b[^.!?]{0,60}?\b(it['’]?s|they['’]?re|we['’]?re|that['’]?s)\b/gi, oncePerPage: true },
  { id: 'whilst', label: 'British spelling', severity: 'flag', suggestion: "use 'while'", re: /\bwhilst\b/gi },
  { id: 'is-real', label: '“the X is real” tic', severity: 'flag', suggestion: 'state it directly', re: /\bthe\b[^.!?,]{2,40}?\bis real\b/gi },
  { id: 'landscape', label: 'Metaphor cliché', severity: 'flag', suggestion: "drop 'landscape' — name the actual market/field", re: /\b(the\s+)?(ai|digital|business|technology|competitive|threat|market)\s+landscape\b/gi },
  { id: 'navigate', label: 'Metaphor cliché', severity: 'flag', suggestion: "drop 'navigate complexity' — say what you actually do", re: /\bnavigat\w*\s+(complexity|change|uncertainty|the\s+(complexity|landscape|challenges?))\b/gi },
  { id: 'journey', label: 'Metaphor cliché', severity: 'flag', suggestion: "drop the 'journey' metaphor — name the work", re: /\b(your|the|their|customer|digital|transformation)\s+journey\b/gi },
  { id: 'ecosystem', label: 'Metaphor cliché', severity: 'flag', suggestion: 'name the actual tools/partners', re: /\b(digital|partner|tech\w*)\s+ecosystem\b/gi },
  { id: 'fabric', label: 'Metaphor cliché', severity: 'flag', suggestion: 'say it plainly', re: /\b(rich\s+)?(texture|tapestry|fabric)\s+of\b/gi },
];

function runRules(meta, rawText, issues, perPage) {
  const hay = stripMarks(rawText);
  if (!hay.trim()) return;
  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m, n = 0;
    while ((m = rule.re.exec(hay)) !== null) {
      if (m.index === rule.re.lastIndex) rule.re.lastIndex++; // zero-width guard
      const match = m[0];
      if (rule.oncePerPage) {
        perPage[rule.id] = (perPage[rule.id] || 0) + 1;
        if (perPage[rule.id] > 1) continue; // only the first occurrence becomes an issue (count tracked for relabel)
      }
      issues.push({ ...meta, ruleId: rule.id, label: rule.label, severity: rule.severity, suggestion: rule.suggest ? rule.suggest(match) : rule.suggestion, match, snippet: buildSnippet(hay, { start: m.index, end: m.index + match.length }) });
      if (++n >= 8) break; // per-rule cap, like content-search
    }
  }
}

// Walk every page's prose + titles, run the rules, group issues by page (worst offenders first). Pure.
export function checkVoice(state) {
  const pages = (state && state.pages) || {};
  const order = (state && state.order) || Object.keys(pages);
  const groups = [];
  let total = 0, hard = 0, flags = 0;

  order.forEach((slug) => {
    const page = pages[slug];
    if (!page || !page.data) return;
    const title = (page.data.root && page.data.root.props && page.data.root.props.title) || page.title || slug;
    const issues = [];
    const perPage = {};
    runRules({ blockType: 'Page title', field: 'title', fieldLabel: 'Page title' }, title, issues, perPage);
    (page.data.content || []).forEach((block) => {
      const props = (block && block.props) || {};
      const blockType = (block && block.type) || 'Block';
      walkText(props, null, '', (fieldPath, text) => {
        runRules({ blockType, blockId: props.id || '', field: fieldPath, fieldLabel: fieldLabel(blockType, fieldPath) }, text, issues, perPage);
      });
    });
    if (perPage['not-just'] > 1) issues.forEach((i) => { if (i.ruleId === 'not-just') i.label = '“Not just X, it’s Y” tic (used ' + perPage['not-just'] + ' times)'; });
    if (issues.length) {
      issues.sort((a, b) => (a.severity === 'hard' ? 0 : 1) - (b.severity === 'hard' ? 0 : 1));
      total += issues.length;
      hard += issues.filter((i) => i.severity === 'hard').length;
      flags += issues.filter((i) => i.severity === 'flag').length;
      groups.push({ pageSlug: slug, title, count: issues.length, issues });
    }
  });

  groups.sort((a, b) => b.count - a.count);
  return { total, hard, flags, groups };
}
