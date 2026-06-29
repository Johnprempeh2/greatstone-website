import PanelFrame from './PanelFrame.jsx';

// Page templates (starters): a read-only gallery of curated page RECIPES. Pick one → App prompts for a
// title, creates a NEW DRAFT seeded with the recipe's blocks, and opens it in the editor. App owns the
// create (onPick(starterId) → addPageFromStarter). Distinct from Saved sections (inserts one block) and
// Duplicate (clones a live page): a starter needs no exemplar. Reuses gs-* tokens; minimal gs-tmpl-* CSS.
const TYPE_LABELS = {
  Hero: 'Hero', Chapter: 'Body', StatStrip: 'Proof / stats', FeatureGrid: 'Features', Steps: 'Steps',
  Quote: 'Quote', Invite: 'Closing CTA', Figure: 'Figure', Faq: 'FAQ', ServiceCards: 'Services',
  ContactBand: 'Contact', CaseStudy: 'Case studies', LogoWall: 'Logos', BookDeepDive: 'Booking',
};
const typeLabel = (t) => TYPE_LABELS[t] || t;

export default function StartersPanel({ starters = [], onPick, onClose, embedded }) {
  return (
    <PanelFrame embedded={embedded} label="Templates" name="Templates" onClose={onClose}>
      <div className="gs-panel-body">
        <p className="gs-field-hint" style={{ marginTop: 0 }}>
          Start a new page from a ready-made layout — a sensible block sequence with placeholder copy you
          then edit. Every template creates a fresh <strong>draft</strong> you can change or delete any time.
        </p>
        {!starters.length ? (
          <p className="gs-la-clean" role="status">No templates available.</p>
        ) : (
          <ul className="gs-tmpl-list" role="list" aria-label="Page templates">
            {starters.map((s) => (
              <li key={s.id} className="gs-tmpl-card">
                <div className="gs-tmpl-head">
                  <span className="gs-tmpl-label">{s.label}</span>
                  <span className="gs-tmpl-n">{s.blocks.length} block{s.blocks.length === 1 ? '' : 's'}</span>
                </div>
                <p className="gs-tmpl-blurb">{s.blurb}</p>
                <p className="gs-tmpl-chips">{s.blocks.map((b, i) => <span key={i} className="gs-tmpl-chip">{typeLabel(b.type)}</span>)}</p>
                <button type="button" className="gs-btn primary sm" onClick={() => onPick && onPick(s.id)} aria-label={'Create a ' + s.label + ' page from a template'}>Use template</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PanelFrame>
  );
}
