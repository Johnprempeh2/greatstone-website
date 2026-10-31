import React from 'react';
import { createRoot } from 'react-dom/client';
import { config, blockCss } from './puck.config.jsx';
import './site.css';
import './index.css';
import './studio.css';

const names = ['Hero', 'LogoWall', 'PillarCards', 'StatStrip', 'ComparisonMatrix', 'TimeSavingsCalculator', 'AiCostCalculator', 'DxConsultancyMethod', 'Invite'];
const overrides = {
  Hero: { size: 'standard' },
  LogoWall: { mode: 'marquee', logos: [] },
  PillarCards: { pillars: config.components.PillarCards.defaultProps.pillars.slice(0, 5) },
  StatStrip: { body: '' },
  Invite: { variant: 'framed' },
};
createRoot(document.getElementById('root')).render(<>
  <style dangerouslySetInnerHTML={{ __html: blockCss }} />
  {names.map((name) => <div key={name} data-review-block={name}>{React.createElement(config.components[name].render, { ...config.components[name].defaultProps, ...overrides[name], id: `review-${name}`, puck: { isEditing: false } })}</div>)}
</>);
