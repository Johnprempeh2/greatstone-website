'use client';

import { createContext, lazy, Suspense, useContext, useEffect, useRef, useState } from 'react';

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
import * as MotionBand from '../src/blocks/MotionBand.jsx';
import { ContainedMotion, css as containedMotionCss } from '../src/blocks/ContainedMotion.jsx';
import { sectionClass } from '../src/lib/block-style.mjs';
import { bindFormBlock } from '../next-proof/form-bindings.mjs';
import { motionField, MOTION_BY_BLOCK, resolveMotion, resolveMotionFields } from '../next-proof/motion-contract.mjs';
import { createMotionCoordinator } from '../next-proof/motion-runtime.mjs';

const modules = { TwoDoors, TwoDoorsStory, TwoDoorsProof, TwoDoorsTools, DevTools, Hero, MotionBand, Prose, Panels, ServiceCatalog, Invite, Steps, FeatureGrid, Faq, PillarCards, MaturityModel, Chapter, Team, LogoWall, IntelBand, MaturityMap, Ladder, MethodTieIn, IndustryPicker, BookDeepDive, AiBaselineSurvey, AiCostCalculator };
const InsertAfter = lazy(() => import('./editor/InsertAfter.jsx'));
export const PreviewContext = createContext(false);
let motionCoordinator;
let motionUsers = 0;
function BlockAnchor({ props, puck, type }) {
  const preview = useContext(PreviewContext);
  const node = useRef(null);
  const [mode, setMode] = useState('still');
  const motion = resolveMotion(type, props);
  useEffect(() => {
    if (!motion || motion.effect === 'none' || !node.current) return undefined;
    motionCoordinator ||= createMotionCoordinator();
    motionUsers++;
    const unregister = motionCoordinator.register(node.current, motion.intensity, setMode);
    return () => { unregister(); if (--motionUsers === 0) { motionCoordinator.destroy(); motionCoordinator = undefined; } };
  }, [motion?.effect, motion?.intensity]);
  return <div ref={node} id={'gs-blk-' + props.id} className={('gs-blk ' + sectionClass(props._section) + (preview ? ' gs-preview-block' : '')).trim()} data-motion-effect={motion?.effect || undefined} data-motion-mode={motion ? mode : undefined} data-motion-block={type} data-divider={props.divider === 'glow' ? 'glow' : undefined} data-gs-block-id={props.id} data-gs-block-type={type}>{preview && <button type="button" className="gs-preview-pick" aria-label={`Select ${type} block`}>Select block</button>}{motion?.effect?.startsWith('bg.') ? <ContainedMotion effect={motion.effect} intensity={motion.intensity} mode={mode} /> : null}{puck.render(motion ? { ...props, motionRuntime: mode } : props)}{puck.isEditing && <Suspense fallback={null}><InsertAfter id={props.id} /></Suspense>}</div>;
}
const withAnchor = (puck, type) => ({
  ...puck,
  fields: { ...Object.fromEntries(Object.entries(puck.fields).filter(([key]) => !(type === 'Hero' && key === 'stone'))), ...motionField(type), ...(['Hero', 'DevTools', 'AiBaselineSurvey'].includes(type) ? { divider: { type: 'radio', label: 'Divider', options: [{ label: 'None', value: 'none' }, { label: 'Glow', value: 'glow' }] } } : {}) },
  resolveFields: MOTION_BY_BLOCK[type] ? (data, { fields }) => resolveMotionFields(type, data, fields) : puck.resolveFields,
  defaultProps: { ...puck.defaultProps, ...(MOTION_BY_BLOCK[type] ? { motion: MOTION_BY_BLOCK[type].default } : {}), ...(['Hero', 'DevTools', 'AiBaselineSurvey'].includes(type) ? { divider: 'none' } : {}) },
  render: (props) => <BlockAnchor props={props} puck={puck} type={type} />,
});

export const proofConfig = {
  components: Object.fromEntries(Object.entries(modules).map(([name, module]) => [name, withAnchor(module.puck, name)])),
  categories: { page: { title: 'Page', components: Object.keys(modules) } },
};

const publicPuck = { isEditing: false, renderDropZone: () => null, dragRef: null };
export function ProofBlocks({ data, pageSlug, forms }) {
  return <><style>{Object.values(modules).map((module) => module.css || '').join('\n') + containedMotionCss}</style>{data.content.map((item) => {
    const component = proofConfig.components[item.type];
    if (!component) throw new Error(`Unsupported published block: ${item.type}`);
    return <div key={item.props.id}>{component.render({ ...bindFormBlock(pageSlug, item, forms), puck: publicPuck })}</div>;
  })}</>;
}
