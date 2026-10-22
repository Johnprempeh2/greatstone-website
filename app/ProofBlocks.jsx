'use client';

import * as TwoDoors from '../src/blocks/TwoDoors.jsx';
import * as TwoDoorsStory from '../src/blocks/TwoDoorsStory.jsx';
import * as TwoDoorsProof from '../src/blocks/TwoDoorsProof.jsx';
import * as TwoDoorsTools from '../src/blocks/TwoDoorsTools.jsx';
import * as DevTools from '../src/blocks/DevTools.jsx';
import * as Hero from '../src/blocks/Hero.jsx';
import * as Prose from '../src/blocks/Prose.jsx';
import * as Panels from '../src/blocks/Panels.jsx';
import * as ServiceCatalog from '../src/blocks/ServiceCatalog.jsx';
import * as Invite from '../src/blocks/Invite.jsx';
import * as Steps from '../src/blocks/Steps.jsx';
import * as FeatureGrid from '../src/blocks/FeatureGrid.jsx';
import * as Faq from '../src/blocks/Faq.jsx';
import * as PillarCards from '../src/blocks/PillarCards.jsx';
import * as MaturityModel from '../src/blocks/MaturityModel.jsx';
import * as Chapter from '../src/blocks/Chapter.jsx';
import * as Team from '../src/blocks/Team.jsx';
import * as LogoWall from '../src/blocks/LogoWall.jsx';
import * as IntelBand from '../src/blocks/IntelBand.jsx';
import * as MaturityMap from '../src/blocks/MaturityMap.jsx';
import * as Ladder from '../src/blocks/Ladder.jsx';
import * as MethodTieIn from '../src/blocks/MethodTieIn.jsx';
import * as IndustryPicker from '../src/blocks/IndustryPicker.jsx';
import * as BookDeepDive from '../src/blocks/BookDeepDive.jsx';
import * as AiBaselineSurvey from '../src/blocks/AiBaselineSurvey.jsx';
import * as AiCostCalculator from '../src/blocks/AiCostCalculator.jsx';
import { sectionClass } from '../src/lib/block-style.mjs';

const modules = { TwoDoors, TwoDoorsStory, TwoDoorsProof, TwoDoorsTools, DevTools, Hero, Prose, Panels, ServiceCatalog, Invite, Steps, FeatureGrid, Faq, PillarCards, MaturityModel, Chapter, Team, LogoWall, IntelBand, MaturityMap, Ladder, MethodTieIn, IndustryPicker, BookDeepDive, AiBaselineSurvey, AiCostCalculator };
const withAnchor = (puck) => ({
  ...puck,
  render: (props) => <div id={'gs-blk-' + props.id} className={('gs-blk ' + sectionClass(props._section)).trim()}>{puck.render(props)}</div>,
});

export const proofConfig = {
  components: Object.fromEntries(Object.entries(modules).map(([name, module]) => [name, withAnchor(module.puck)])),
  categories: { page: { title: 'Page', components: Object.keys(modules) } },
};

const publicPuck = { isEditing: false, renderDropZone: () => null, dragRef: null };
export function ProofBlocks({ data }) {
  return <><style>{Object.values(modules).map((module) => module.css || '').join('\n')}</style>{data.content.map((item) => {
    const component = proofConfig.components[item.type];
    if (!component) throw new Error(`Unsupported published block: ${item.type}`);
    return <div key={item.props.id}>{component.render({ ...item.props, puck: publicPuck })}</div>;
  })}</>;
}
