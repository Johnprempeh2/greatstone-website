const HIDDEN_FIELDS = new Set(['id', '_section', 'href', 'url', 'src', 'image', 'imageUrl']);
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

function plainText(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (match, name) => {
    if (ENTITIES[name]) return ENTITIES[name];
    if (name.startsWith('#')) {
      const code = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return match;
  }).replace(/\s+/g, ' ').trim();
}

function fieldLabel(path) {
  return path.split(' / ').map((part) => part.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase())).join(' / ');
}

function wording(value, path = [], result = {}) {
  if (typeof value === 'string') {
    const key = path.at(-1);
    if (key && !HIDDEN_FIELDS.has(key) && !key.startsWith('_')) {
      result[path.join(' / ')] = plainText(value);
    }
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => wording(item, [...path, String(index + 1)], result));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => wording(item, [...path, key], result));
  }
  return result;
}

export function changedBlockText(mine, theirs) {
  const mineBlocks = mine?.content || [];
  const theirBlocks = theirs?.content || [];
  const ids = [...new Set([...mineBlocks, ...theirBlocks].map((block) => block.props.id))];
  return ids.flatMap((id) => {
    const mineBlock = mineBlocks.find((block) => block.props.id === id);
    const theirBlock = theirBlocks.find((block) => block.props.id === id);
    const mineText = wording(mineBlock?.props);
    const theirText = wording(theirBlock?.props);
    const fields = [...new Set([...Object.keys(mineText), ...Object.keys(theirText)])]
      .filter((label) => mineText[label] !== theirText[label])
      .map((label) => ({ label: fieldLabel(label), mine: mineText[label] || '', theirs: theirText[label] || '' }));
    return fields.length ? [{ id, name: mineBlock?.type || theirBlock?.type || 'Block', fields }] : [];
  });
}
