import React from 'react';
import { createRoot } from 'react-dom/client';
import { LayerStack } from './src/blocks/LayerStack.jsx';
import { BridgeMap } from './src/blocks/BridgeMap.jsx';
import { ProofBars } from './src/blocks/ProofBars.jsx';
import { blockCss } from './src/puck.config.jsx';
import './src/site.css';
const data = { id: 'preview', puck: { isEditing: false } };
createRoot(document.getElementById('root')).render(<><style>{blockCss}</style><div style={{padding:'12px 24px',background:'var(--gs-bg-deep)',color:'var(--gs-text-muted)',fontSize:12}}>LayerStack · BridgeMap · ProofBars | Made by Facet · OpenAI Codex</div><LayerStack {...data} eyebrow="How we work" heading="A method that builds in layers." body="Each step gives the next one a firmer footing." /><BridgeMap {...data} eyebrow="Where we work" heading="A bridge between the UK and Ghana." body="Our work connects teams and markets across both places." /><ProofBars {...data} preview eyebrow="Measured outcomes" heading="Evidence you can inspect." body="Add verified measurements before publication." method="Placeholder: add the measurement method." bars={[{ label: 'Placeholder: Greatstone result', value: 0, ours: true }]} /></>);
