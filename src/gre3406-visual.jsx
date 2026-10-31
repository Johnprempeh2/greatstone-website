import React from 'react';
import { createRoot } from 'react-dom/client';
import { config, blockCss } from './puck.config.jsx';
import './site.css';
import './index.css';
import './studio.css';
import { categories } from './data/service-catalog.mjs';

const names = ['Hero', 'LogoWall', 'PillarCards', 'StatStrip', 'ComparisonMatrix', 'TimeSavingsCalculator', 'AiCostCalculator', 'DxConsultancyMethod', 'Invite'];
const overrides = {
  Hero: { size: 'standard' },
  LogoWall: { mode: 'marquee', logos: [] },
  PillarCards: {
    mode: 'capabilities',
    kicker: 'Service catalogue',
    heading: 'Five service areas.',
    body: 'A layout sample using entries from the current service catalogue.',
    pillars: categories.slice(0, 5).map(({ name, blurb }) => ({ name, def: blurb, tag: '', chips: [], href: '' })),
  },
  StatStrip: { body: '', variant: 'plain' },
  Invite: { variant: 'framed' },
};
createRoot(document.getElementById('root')).render(<>
  <style dangerouslySetInnerHTML={{ __html: blockCss }} />
  {names.map((name) => <div key={name} data-review-block={name}>{React.createElement(config.components[name].render, { ...config.components[name].defaultProps, ...overrides[name], id: `review-${name}`, puck: { isEditing: false } })}</div>)}
</>);
