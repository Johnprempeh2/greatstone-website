import { useState, useEffect, useMemo, useRef, useId } from 'react';
import PanelFrame from './PanelFrame.jsx';
import { searchContent } from '../lib/content-search.mjs';

// Read-only in-studio content search. Searches the words in every page's blocks + the page titles (the
// ⌘K palette only matches page/command NAMES). Pure searchContent() does the work; this debounces the
// query, renders grouped results with a highlighted snippet, and an Open deep-link. Nothing mutates state.
export default function ContentSearchPanel({ state, onOpen, onClose, embedded }) {
  const [raw, setRaw] = useState('');
  const [query, setQuery] = useState(''); // debounced value that actually drives the search
  const inputRef = useRef(null);
  const inputId = useId();
  const statusId = useId();

  useEffect(() => { const t = setTimeout(() => setQuery(raw), 180); return () => clearTimeout(t); }, [raw]);
  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  const result = useMemo(() => searchContent(state, query), [state, query]);
  const trimmed = raw.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 2;
  const showEmpty = trimmed.length === 0;
  const noResults = !showEmpty && !tooShort && result.total === 0;

  // split a snippet into [before][mark][after] using the precomputed offsets (no re-search)
  const renderSnippet = (s) => {
    const before = s.text.slice(0, s.hi.start);
    const hit = s.text.slice(s.hi.start, s.hi.end);
    const after = s.text.slice(s.hi.end);
    return (<>{s.truncatedStart ? '…' : ''}{before}<mark className="gs-cs-mark">{hit}</mark>{after}{s.truncatedEnd ? '…' : ''}</>);
  };

  const liveMsg = showEmpty ? '' : tooShort ? 'Type at least 2 characters'
    : result.total === 0 ? 'No matches'
    : result.total + ' match' + (result.total === 1 ? '' : 'es') + ' on ' + result.groups.length + ' page' + (result.groups.length === 1 ? '' : 's');

  return (
    <PanelFrame embedded={embedded} label="Search content" name="Search content" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Search the words across every page — headlines, body copy, FAQ answers, step text — then jump
          straight to the page. (The ⌘K palette only finds page and command <em>names</em>.) Read-only:
          nothing here changes your content.
        </p>

        <div className="gs-cs-search">
          <label htmlFor={inputId} className="gs-sr-only">Search page content</label>
          <input
            id={inputId} ref={inputRef} type="search" className="gs-cs-input"
            placeholder="Search all page content…" value={raw}
            onChange={(e) => setRaw(e.target.value)} autoComplete="off" spellCheck="false"
            aria-describedby={statusId}
          />
        </div>

        {/* always-mounted live region so the FIRST count is announced */}
        <p id={statusId} className="gs-cs-count" role="status" aria-live="polite">{liveMsg}</p>

        {showEmpty ? (
          <p className="gs-cs-hint" role="note">Start typing to search across all pages.</p>
        ) : tooShort ? null
        : noResults ? (
          <p className="gs-cs-empty" role="status">No content matches “{trimmed}”. Try a shorter or different word.</p>
        ) : (
          <div className="gs-cs-results">
            {result.groups.map((g) => (
              <section className="gs-cs-group" key={g.pageSlug} aria-label={g.title + ', ' + g.count + ' matches'}>
                <header className="gs-cs-grouph">
                  <h3>{g.title} <span className="gs-cs-sub">{g.count} match{g.count === 1 ? '' : 'es'}</span></h3>
                  {onOpen ? <button type="button" className="gs-btn ghost sm" onClick={() => onOpen(g.pageSlug)} aria-label={'Open ' + g.title + ' in the editor'}>Open</button> : null}
                </header>
                <ul className="gs-cs-list">
                  {g.hits.map((h, k) => (
                    <li className="gs-cs-row" key={k}>
                      <span className="gs-cs-where">{h.blockType}{h.label && h.label !== 'Page title' ? ' · ' + h.label : ''}</span>
                      <span className="gs-cs-snippet">{renderSnippet(h.snippet)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PanelFrame>
  );
}
