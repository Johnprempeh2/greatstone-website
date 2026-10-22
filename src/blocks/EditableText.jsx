import { lazy, Suspense } from 'react';
import RichText from './RichText.jsx';
import { useFrameEditing } from '../../app/editor/frame-context.jsx';

// One wrapper every block uses to render a text field: an inline-on-canvas rich editor while EDITING (click the
// text on the page, type, and format it via the top Text tab), and the static, sanitised RichText on the public
// site. This is the single seam that makes "click any text and edit it granularly" uniform across every block.
//
// PUBLIC-SAFE: InlineRichText is lazy-loaded and only mounted when `editing` is true, so @measured/puck never
// reaches the public bundle and usePuck() is never called outside the Puck provider. `editing` = props.puck?.isEditing.
const InlineRichText = lazy(() => import('../cms/InlineRichText.jsx'));
const FrameRichText = lazy(() => import('../cms/InlineRichTextCore.jsx'));

export default function EditableText({ editing, id, field, value, as = 'span', className, singleLine = false, placeholder, arrayField, index, path, ...rest }) {
  const frameEditing = useFrameEditing();
  if (editing) {
    const Editor = frameEditing ? FrameRichText : InlineRichText;
    return (
      <Suspense fallback={<RichText as={as} className={className} singleLine={singleLine} html={value} />}>
        <Editor id={id} field={field} value={value} as={as} className={className} singleLine={singleLine} placeholder={placeholder} arrayField={arrayField} index={index} path={path} />
      </Suspense>
    );
  }
  return (value || value === 0)
    ? <RichText as={as} className={className} singleLine={singleLine} html={value} {...rest} />
    : null;
}
