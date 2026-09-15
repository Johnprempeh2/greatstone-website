import React from 'react';

/** The head of one tab.
 *
 *  ⚠ THE ENGAGEMENT HEADER USED TO SIT ABOVE EVERY TAB: the client, the sponsor, the stage, the
 *  access, the title and two buttons, repeated over Processes, Sessions, KPIs and the rest. It is
 *  the right header for the Overview and it is noise on the other nine, where it pushed the thing
 *  somebody actually came for below the fold and told them nothing about it.
 *
 *  Each tab says what it is and counts what it holds. The counts are not decoration: they are the
 *  first answer to "how much of this is done", which on every one of these tabs is the question.
 *  A count of zero is shown rather than hidden, because an empty section is the finding. */
export default function TabHead({
  title, lead, stats = [], actions = null, eyebrow = null, logo = null, logoAlt = '',
}) {
  // ⚠ THE SAME RULE AS THE "0 of 0" ONE BELOW, FOR THE STATS THAT WRITE IT AS A BARE NUMBER.
  // Filtering ratios of nothing left "To investigate 0", "To validate 0", "Ratings to revisit 0",
  // "Nobody set to answer 0" and "Names not followed 0" on tabs whose set is empty: five more
  // measurements of nothing, on the screen a new engagement opens on. The Pillars tab showed five
  // zeros in its strip, two more in its filter chips and eight more in its pillar boxes.
  //
  // ⚠ IT CANNOT KEY ON THE VALUE BEING ZERO. On a record with nine sessions, "Nobody set to answer:
  // 0" is real news: a gap that is closed. The vacuous case is a derived measure of an EMPTY SET,
  // so the caller marks which of its stats are derived and the set is empty when every stat that is
  // NOT derived reads zero. That keeps "Teams 0" and "People 0" side by side on an empty
  // Organisation tab, because those are two facts rather than one fact and a measurement of it.
  const counts = stats.filter((x) => !x.derived);
  const empty = counts.length > 0 && counts.every((x) => String(x.v).trim() === '0');
  const shown = stats
    .filter((x) => !(empty && x.derived))
    .filter((x) => String(x.v).trim() !== '0 of 0');
  return (
    <header className="dd-thead">
      <div className="dd-thead-r">
        {/* ⚠ A PLATE, NOT A BARE IMAGE. A client's mark is almost always a JPEG on white, so on a
            dark ground it arrives as a white rectangle with no edge and no reason to be there. The
            plate turns that into a deliberate surface the mark sits on, which is what a logo needs
            and what the top bar had no room to give it. Hidden if the file is gone rather than
            leaving a broken-image glyph at the top of a client's own record. */}
        {logo && (
          <span className="dd-hero-mark">
            <img src={logo} alt={logoAlt} decoding="async"
              onError={(e) => { e.currentTarget.closest('.dd-hero-mark').style.display = 'none'; }} />
          </span>
        )}
        <div className="dd-thead-t">
          {eyebrow && (
            <p className="dd-eyebrow">
              
              {eyebrow}
            </p>
          )}
          <h1>{title}</h1>
          {lead && <p className="dd-lead">{lead}</p>}
        </div>
        {actions && <div className="dd-headtools">{actions}</div>}
      </div>
      {/* ⚠ A RATIO OF NOTHING IS NOT A STATISTIC. A record exists for every client from first
          contact, so an empty tab is the ordinary first impression, and these strips opened with
          "Walked end to end 0 of 0", "Mapped inside 0 of 0", "Tied to a team 0 of 0" — three
          measurements of a set with no members, beside the count that already said so. The count
          stays, because "Processes 0" is a fact; the ratios go until there is something to be a
          ratio of. */}
      {shown.length > 0 && (
        <dl className="dd-meta dd-thead-m">
          {shown.map((x) => (
            <div key={x.l}>
              <dt>{x.l}</dt>
              <dd className={x.gap ? 'dd-covgap' : undefined}>{x.v}</dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

