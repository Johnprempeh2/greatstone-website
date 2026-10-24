import { findBlock } from './frame-protocol.mjs';

const failure = (code, message) => ({ ok: false, code, message });

function validAssetUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\]/.test(value)) return false;
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !!url.hostname;
  } catch { return false; }
}

export function insertMediaResult(requestId, result) {
  return result.ok
    ? { requestId, ok: true }
    : { requestId, ok: false, code: result.code, message: result.message };
}

export function insertMedia(draft, components, payload, isMediaField) {
  const { blockId, field, mediaEntryId, assetUrl, alt } = payload || {};
  if (typeof mediaEntryId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(mediaEntryId) || !validAssetUrl(assetUrl) || typeof alt !== 'string' || alt.length > 500) {
    return failure('invalid_payload', 'The media entry is invalid.');
  }
  const data = structuredClone(draft);
  const block = findBlock(data?.content, blockId);
  if (!block) return failure('block_not_found', 'That block is no longer in the draft.');

  const fields = components[block.type]?.fields;
  const parts = typeof field === 'string' ? field.split('.') : [];
  let schema = fields;
  let values = block.props;
  for (let i = 0; i < parts.length - 1; i += 2) {
    const name = parts[i];
    const index = parts[i + 1];
    if (schema?.[name]?.type !== 'array' || !/^(0|[1-9]\d*)$/.test(index || '') || !Array.isArray(values?.[name]) || !values[name][Number(index)]) {
      return failure('field_not_found', 'That field is no longer in the block.');
    }
    schema = schema[name].arrayFields;
    values = values[name][Number(index)];
  }
  const name = parts.at(-1);
  const definition = name && schema?.[name];
  if (!definition || !values || !Object.hasOwn(values, name)) return failure('field_not_found', 'That field is no longer in the block.');
  if (!isMediaField(definition)) return failure('field_not_media', 'That field does not take an image or video.');
  values[name] = `media:${mediaEntryId}`;
  const altField = [`${name}Alt`, 'alt'].find((candidate) => schema?.[candidate]?.type === 'text' && Object.hasOwn(values, candidate));
  if (altField) values[altField] = alt;
  return { ok: true, data, mediaRef: values[name], assetUrl, dirty: true };
}
