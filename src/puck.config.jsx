import * as Hero from './blocks/Hero.jsx';
import * as Prose from './blocks/Prose.jsx';
import * as Chapter from './blocks/Chapter.jsx';
import * as Statement from './blocks/Statement.jsx';
import * as Panels from './blocks/Panels.jsx';
import * as Pillars from './blocks/Pillars.jsx';
import * as PillarExplorer from './blocks/PillarExplorer.jsx';
import * as Steps from './blocks/Steps.jsx';
import * as StatStrip from './blocks/StatStrip.jsx';
import * as Invite from './blocks/Invite.jsx';
import * as FeatureGrid from './blocks/FeatureGrid.jsx';
import * as Timeline from './blocks/Timeline.jsx';
import * as Team from './blocks/Team.jsx';
import * as Quote from './blocks/Quote.jsx';
import * as CaseStudy from './blocks/CaseStudy.jsx';
import * as RoiBar from './blocks/RoiBar.jsx';
import * as FeaturedArticle from './blocks/FeaturedArticle.jsx';
import * as Spectrum from './blocks/Spectrum.jsx';
import * as MaturityMap from './blocks/MaturityMap.jsx';
import * as Ladder from './blocks/Ladder.jsx';
import * as BookDeepDive from './blocks/BookDeepDive.jsx';
import * as ContactBand from './blocks/ContactBand.jsx';
import * as TimeCounter from './blocks/TimeCounter.jsx';
import * as Figure from './blocks/Figure.jsx';
import * as Storefront from './blocks/Storefront.jsx';
import * as Values from './blocks/Values.jsx';
import * as MaturityModel from './blocks/MaturityModel.jsx';
import * as IndustryPicker from './blocks/IndustryPicker.jsx';
import * as ServiceCards from './blocks/ServiceCards.jsx';
import * as ServiceCatalog from './blocks/ServiceCatalog.jsx';
import * as InsightsGrid from './blocks/InsightsGrid.jsx';
import * as NewsletterBand from './blocks/NewsletterBand.jsx';
import * as Terrace from './blocks/Terrace.jsx';
import * as MethodTieIn from './blocks/MethodTieIn.jsx';
import * as IntelBand from './blocks/IntelBand.jsx';
import * as PillarCards from './blocks/PillarCards.jsx';
import * as Faq from './blocks/Faq.jsx';
import * as TimeSavingsCalculator from './blocks/TimeSavingsCalculator.jsx';
import * as LogoWall from './blocks/LogoWall.jsx';
import * as ComparisonMatrix from './blocks/ComparisonMatrix.jsx';
import * as Columns from './blocks/Columns.jsx';
import * as AiBaselineSurvey from './blocks/AiBaselineSurvey.jsx';
import * as AiCostCalculator from './blocks/AiCostCalculator.jsx';
import { sectionClass } from './lib/block-style.mjs';
import { SECTION_FIELD, SECTION_DEFAULT } from './cms/style-field.jsx';

// One block library, assembled from self-contained block files. Each block file owns its
// component, its CSS, and its Puck fragment (fields/defaults/permissions/render). Marketing
// configures fields; the components and their motion are code-owned — "edit, don't restyle".
const MODULES = { Hero, Prose, Chapter, Statement, Panels, Columns, Pillars, PillarCards, PillarExplorer, IndustryPicker, MaturityMap, MaturityModel, Steps, ServiceCards, ServiceCatalog, Terrace, Spectrum, Timeline, Ladder, MethodTieIn, StatStrip, CaseStudy, RoiBar, Quote, Team, Values, FeaturedArticle, InsightsGrid, IntelBand, Figure, Storefront, TimeCounter, BookDeepDive, ContactBand, Invite, FeatureGrid, NewsletterBand, Faq, TimeSavingsCalculator, AiBaselineSurvey, AiCostCalculator, LogoWall, ComparisonMatrix };

// wrap every block's render in a measurable anchor (id = gs-blk-<blockId>) so the 3D background
// editor can pin a scene transition to "when you reach this block" — resolved live from the
// element's scroll position. This single wrapper is also the universal seam for the "Section" group
// (background surface band, palette accent re-tint, spacing rhythm): merging the field + default here
// gives EVERY block the controls in one place, and every default maps to no class so pages are unchanged.
const withAnchor = (puck) => ({
  ...puck,
  fields: {
    ...(puck.fields || {}),
    _section: SECTION_FIELD,
    _note: { type: 'textarea', label: 'Internal note (private, never shown on the site)' },
  },
  defaultProps: { ...(puck.defaultProps || {}), _section: SECTION_DEFAULT, _note: '' },
  render: (props) => (
    <div id={'gs-blk-' + props.id} className={('gs-blk ' + sectionClass(props._section)).trim()}>
      {/* editor-only memo ribbon: visible while building, never rendered on the public site */}
      {props.puck && props.puck.isEditing && props._note
        ? <div className="gs-blk-note" contentEditable={false}>{props._note}</div> : null}
      {puck.render(props)}
    </div>
  ),
});

export const config = {
  components: Object.fromEntries(Object.entries(MODULES).map(([name, m]) => [name, withAnchor(m.puck)])),
  // group the block drawer so the section types read as a deliberate kit, not a junk drawer
  categories: {
    page: { title: 'Page', components: ['Hero', 'Invite', 'NewsletterBand'] },
    story: { title: 'Story', components: ['Prose', 'Chapter', 'Statement', 'Columns', 'Pillars', 'PillarCards', 'PillarExplorer', 'IndustryPicker', 'MaturityMap', 'MaturityModel', 'Steps', 'ServiceCards', 'ServiceCatalog', 'Terrace', 'Spectrum', 'Timeline', 'Ladder', 'MethodTieIn'] },
    proof: { title: 'Proof', components: ['StatStrip', 'LogoWall', 'ComparisonMatrix', 'CaseStudy', 'RoiBar', 'Quote', 'Team', 'Values', 'FeatureGrid', 'Faq', 'TimeSavingsCalculator', 'AiBaselineSurvey', 'AiCostCalculator'] },
    editorial: { title: 'Editorial', components: ['IntelBand', 'FeaturedArticle', 'InsightsGrid', 'Figure'] },
    commerce: { title: 'Commerce', components: ['Storefront'] },
    contact: { title: 'Contact', components: ['TimeCounter', 'BookDeepDive', 'ContactBand'] },
  },
};

// every registered block's CSS, aggregated into one stylesheet injected by App.
export const blockCss = Object.values(MODULES).map((m) => m.css || '').join('\n');
