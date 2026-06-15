import * as Hero from './blocks/Hero.jsx';
import * as Chapter from './blocks/Chapter.jsx';
import * as Pillars from './blocks/Pillars.jsx';
import * as PillarExplorer from './blocks/PillarExplorer.jsx';
import * as Steps from './blocks/Steps.jsx';
import * as StatStrip from './blocks/StatStrip.jsx';
import * as Invite from './blocks/Invite.jsx';
import * as FeatureGrid from './blocks/FeatureGrid.jsx';

// One block library, assembled from self-contained block files. Each block file owns its
// component, its CSS, and its Puck fragment (fields/defaults/permissions/render). Marketing
// configures fields; the components and their motion are code-owned — "edit, don't restyle".
const MODULES = { Hero, Chapter, Pillars, PillarExplorer, Steps, StatStrip, Invite, FeatureGrid };

export const config = {
  components: Object.fromEntries(Object.entries(MODULES).map(([name, m]) => [name, m.puck])),
  // group the block drawer so the section types read as a deliberate kit, not a junk drawer
  categories: {
    page: { title: 'Page', components: ['Hero', 'Invite'] },
    story: { title: 'Story', components: ['Chapter', 'Pillars', 'PillarExplorer', 'Steps'] },
    proof: { title: 'Proof', components: ['StatStrip', 'FeatureGrid'] },
  },
};

// every registered block's CSS, aggregated into one stylesheet injected by App.
export const blockCss = Object.values(MODULES).map((m) => m.css || '').join('\n');
