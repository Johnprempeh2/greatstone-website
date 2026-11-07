// Editor contract 2 (GSAM GRE-2394): Edit copy. GSAM's hello says `editMode`; `layout` switches it live;
// `import-live` puts the live page into an empty draft. An older GSAM sends no `editMode`: today's editor.
import { splitTwoDoorsToolsDraft } from './two-doors-draft.mjs';
import { SITE_CONTRACT } from './site-contract.mjs';

export const EDITOR_CONTRACT = 2;
export const EDITOR_COMMANDS = ['undo', 'redo', 'save', 'add-block', 'deselect', 'outline', 'layout', 'import-live', 'viewport'];
export function helloAckPayload({ protocol, nonce, siteId, engine, mode, liveData, editorMessages, motion }) {
  return { protocol, nonce, siteId, engine, supportedReleaseSchemas: [1],
    ...(mode === 'editor' ? { editorCommands: EDITOR_COMMANDS, editorContract: EDITOR_CONTRACT,
      editorMessages, liveContent: liveContentOf(liveData) } : {}), siteContract: SITE_CONTRACT, ...motion };
}
const SWITCH_COMMANDS = ['outline', 'layout'];

export function validEditorCommand(payload) {
  if (payload?.command === 'viewport') return !!editorViewportUi(payload.width) && payload.on === undefined && Object.keys(payload).every((key) => ['command', 'width'].includes(key));
  return !!payload && typeof payload === 'object' && !Array.isArray(payload) && payload.width === undefined &&
    EDITOR_COMMANDS.includes(payload.command) &&
    (SWITCH_COMMANDS.includes(payload.command) ? typeof payload.on === 'boolean' : payload.on === undefined);
}

/** The edit mode GSAM's hello asks for. Missing or unknown: Layout, the editor before Edit copy. */
export function editModeOf(helloPayload) {
  return helloPayload?.editMode === 'copy' ? 'copy' : 'layout';
}

/** Edit copy changes words only: Puck may not drag, duplicate, delete or insert blocks. */
export const COPY_PERMISSIONS = Object.freeze({ drag: false, duplicate: false, delete: false, insert: false });

/** Puck's delete guard misses iframe elements across realms; keep its shortcut outside inline text. */
export function keepTextDeleteInField(event) {
  if (event.key === 'Backspace' || event.key === 'Delete') event.stopPropagation();
}

/** Commands Edit copy refuses: they open the block library or the outline. */
export function copyModeAllows(command) {
  return command !== 'add-block' && command !== 'outline';
}

/** `liveContent` for hello-ack: the live page's top-level block count, or null when it has none. */
export function liveContentOf(liveData) {
  const blocks = Array.isArray(liveData?.content) ? liveData.content.length : 0;
  return blocks > 0 ? { blocks: Math.min(blocks, 500) } : null;
}

/** The live page to import into an empty draft, block ids unchanged; null when there is nothing to do. */
export function importLiveData(liveData, draft) {
  if (!liveContentOf(liveData) || !Array.isArray(draft?.content) || draft.content.length > 0) return null;
  return structuredClone({ root: liveData.root ?? { props: {} }, content: liveData.content, ...(liveData.zones ? { zones: liveData.zones } : {}) });
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

/** Viewport is editor UI state, never page content or a draft revision. */
export function editorViewportUi(width) {
  if (width !== null && ![390, 768, 1440].includes(width)) return null;
  return { viewports: { current: { width: width ?? '100%', height: 'auto' }, controlsVisible: false, options: [] } };
}

/** Opening Edit copy cannot migrate a draft's structure or trigger a structural save. */
export function prepareEditorDraft(data, copy) {
  return copy ? data : splitTwoDoorsToolsDraft(data);
}
