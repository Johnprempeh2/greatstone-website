// Subtle inline emphasis: render **double-asterisk** spans as <strong>, matching the live .ch-copy strong
// (brighter text + weight 700, never lime — see the body-strong CSS in Chapter/StatStrip).
//
// PUBLIC VIEW ONLY. In the Puck editor canvas the raw string must stay a single direct text child so the
// field's contentEditable inline editing keeps working — so we no-op (return the raw string) when isEditing.
// Editors see the literal **markers** in the canvas; visitors see the rendered emphasis.
export function emphasize(text, isEditing) {
  if (isEditing || typeof text !== 'string' || text.indexOf('**') === -1) return text;
  // split on **...**; the capturing group puts the bolded runs at odd indices.
  return text.split(/\*\*([^*]+)\*\*/g).map((part, i) => (
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  ));
}
