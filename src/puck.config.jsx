import * as Hero from './blocks/Hero.jsx';
import * as Chapter from './blocks/Chapter.jsx';
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

// One block library, assembled from self-contained block files. Each block file owns its
// component, its CSS, and its Puck fragment (fields/defaults/permissions/render). Marketing
// configures fields; the components and their motion are code-owned — "edit, don't restyle".
const MODULES = { Hero, Chapter, Pillars, PillarExplorer, MaturityMap, Steps, Spectrum, Timeline, Ladder, StatStrip, CaseStudy, RoiBar, Quote, Team, FeaturedArticle, TimeCounter, BookDeepDive, ContactBand, Invite, FeatureGrid };

export const config = {
  components: Object.fromEntries(Object.entries(MODULES).map(([name, m]) => [name, m.puck])),
  // group the block drawer so the section types read as a deliberate kit, not a junk drawer
  categories: {
    page: { title: 'Page', components: ['Hero', 'Invite'] },
    story: { title: 'Story', components: ['Chapter', 'Pillars', 'PillarExplorer', 'MaturityMap', 'Steps', 'Spectrum', 'Timeline', 'Ladder'] },
    proof: { title: 'Proof', components: ['StatStrip', 'CaseStudy', 'RoiBar', 'Quote', 'Team', 'FeatureGrid'] },
    editorial: { title: 'Editorial', components: ['FeaturedArticle'] },
    contact: { title: 'Contact', components: ['TimeCounter', 'BookDeepDive', 'ContactBand'] },
  },
};

// every registered block's CSS, aggregated into one stylesheet injected by App.
export const blockCss = Object.values(MODULES).map((m) => m.css || '').join('\n');
