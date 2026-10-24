export const EDITOR_COMMANDS = ['undo', 'redo', 'save', 'add-block', 'deselect', 'outline'];

export function validEditorCommand(payload) {
  return !!payload && typeof payload === 'object' && !Array.isArray(payload) &&
    EDITOR_COMMANDS.includes(payload.command) &&
    (payload.command === 'outline' ? typeof payload.on === 'boolean' : payload.on === undefined);
}

export function editorState(selectedItem, history, outline = false) {
  return {
    selection: selectedItem ? { blockId: selectedItem.props.id, blockType: selectedItem.type, label: selectedItem.type } : null,
    canUndo: !!history?.hasPast,
    canRedo: !!history?.hasFuture,
    outline,
  };
}

export function validEditorState(payload) {
  const selection = payload?.selection;
  return !!payload && !Array.isArray(payload) && typeof payload.canUndo === 'boolean' && typeof payload.canRedo === 'boolean' &&
    (payload.outline === undefined || typeof payload.outline === 'boolean') &&
    (selection === null || (!!selection && ['blockId', 'blockType', 'label'].every((key) => typeof selection[key] === 'string' && !!selection[key])));
}

export function validEditorKey(payload) { return payload?.key === 'escape'; }

export function validMediaRequest(payload) {
  return !!payload && ['blockId', 'field'].every((key) => typeof payload[key] === 'string' && !!payload[key]) &&
    ['image', 'animation'].includes(payload.kind) && (payload.label === undefined || typeof payload.label === 'string');
}

export function mediaRequest(item, element, components) {
  if (!item || !element || !['IMG', 'VIDEO'].includes(element.tagName)) return null;
  const source = element.getAttribute?.('src') || element.currentSrc || element.src;
  const fields = components[item.type]?.fields || {};
  function find(values, schema, prefix = '') {
    for (const [name, definition] of Object.entries(schema)) {
      const path = prefix + name;
      if (Array.isArray(values?.[name]) && definition.type === 'array') {
        for (let index = 0; index < values[name].length; index++) {
          const nested = find(values[name][index], definition.arrayFields || {}, `${path}.${index}.`);
          if (nested) return nested;
        }
      } else if (values?.[name] === source && ['image', 'video', 'custom'].includes(definition.type)) {
        return { field: path, label: definition.label || name };
      }
    }
    return null;
  }
  const match = find(item.props, fields);
  if (!match) return null;
  return { blockId: item.props.id, ...match, kind: element.tagName === 'VIDEO' ? 'animation' : 'image' };
}
