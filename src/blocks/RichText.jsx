import { sanitizeInline } from '../lib/sanitize-html.mjs';
import { looksLikeHtml, plainToRichHtml } from '../lib/richtext-normalise.mjs';

// The ONE place stored rich-text reaches the DOM. React does NOT escape dangerouslySetInnerHTML, so EVERY
// rich-text value is sanitised through the inline allowlist here first; no block may render a rich-text value
// any other way. A legacy plain string (an old textarea body, or the **bold** convention) is escaped and
// upgraded to <strong> first, so existing copy renders identically and old drafts/seed keep working unchanged.
// Same path in the editor canvas and on the public site (PublicRender), so what you format is what ships.
export function RichText({ html, as: Tag = 'span', className, ...rest }) {
  const raw = html == null ? '' : String(html);
  const source = looksLikeHtml(raw) ? raw : plainToRichHtml(raw);
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: sanitizeInline(source) }} {...rest} />;
}

export default RichText;
