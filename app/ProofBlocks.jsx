'use client';

import * as TwoDoors from '../src/blocks/TwoDoors.jsx';
import * as TwoDoorsStory from '../src/blocks/TwoDoorsStory.jsx';
import * as TwoDoorsProof from '../src/blocks/TwoDoorsProof.jsx';
import * as TwoDoorsTools from '../src/blocks/TwoDoorsTools.jsx';
import * as DevTools from '../src/blocks/DevTools.jsx';
import { sectionClass } from '../src/lib/block-style.mjs';

const modules = { TwoDoors, TwoDoorsStory, TwoDoorsProof, TwoDoorsTools, DevTools };
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
  return <>{data.content.map((item) => {
    const component = proofConfig.components[item.type];
    if (!component) return null;
    return <div key={item.props.id}>{component.render({ ...item.props, puck: publicPuck })}</div>;
  })}</>;
}
