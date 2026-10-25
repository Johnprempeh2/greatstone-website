const closeKeys = ['closeHeading', 'closeLine', 'closeCta', 'contactHref'];
const bottomKeys = ['bottomKicker', 'bottomHeading', 'bottomConsultancy', 'bottomTools', 'consultancyHref', 'toolsHref', 'consultancyImage', 'toolsImage'];
const pick = (props, keys) => Object.fromEntries(keys.filter((key) => key in props).map((key) => [key, props[key]]));

// Existing site drafts store all three sections in one block. Split them once when the
// new editor loads, keeping the original id on the tools section for existing comments.
export function splitTwoDoorsToolsDraft(data) {
  let changed = false;
  const content = data.content.flatMap((block) => {
    if (block.type !== 'TwoDoorsTools' || !block.props?.closeHeading || !block.props?.bottomHeading) return [block];
    changed = true;
    const props = block.props;
    const moved = new Set([...closeKeys, ...bottomKeys.filter((key) => key !== 'toolsHref')]);
    return [
      { ...block, props: Object.fromEntries(Object.entries(props).filter(([key]) => !moved.has(key))) },
      { type: 'TwoDoorsClose', props: { id: `${props.id}-close`, ...pick(props, closeKeys) } },
      { type: 'TwoDoorsBottom', props: { id: `${props.id}-choice`, ...pick(props, bottomKeys) } },
    ];
  });
  return changed ? { ...data, content } : data;
}
