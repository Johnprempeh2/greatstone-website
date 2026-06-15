import { Fragment } from 'react';

// Lightweight public renderer. The public site only needs to PAINT saved content; it does not need
// the @measured/puck editor (~432KB) that Puck's own <Render> drags onto every visitor's first load.
// Our blocks are flat (no Puck zones/slots) and never read the `puck` render prop, so rendering is
// just: for each block in `content`, call its registered render(props). This keeps the entire Puck
// package off the public bundle — the editor is lazy-loaded only when an admin actually edits.
// Contract parity with Puck: each block already carries a stable props.id (used as the key and the
// gs-blk-<id> background anchor); a minimal `puck` stub is passed for defensiveness.
export default function PublicRender({ config, data }) {
  const content = (data && data.content) || [];
  return (
    <>
      {content.map((item, i) => {
        const def = config.components[item.type];
        if (!def || typeof def.render !== 'function') return null;
        const props = { ...item.props, puck: { isEditing: false, renderDropZone: () => null, dragRef: null } };
        return <Fragment key={item.props && item.props.id ? item.props.id : item.type + '-' + i}>{def.render(props)}</Fragment>;
      })}
    </>
  );
}
