import { allowedHostOrigins } from './frame-protocol.mjs';
import { editorPreviewConfig } from './editor-preview-config.mjs';

export function editorHostPolicy(env = process.env, preview = editorPreviewConfig) {
  if (preview) {
    return { host: preview.host, origins: [preview.origin], siteId: preview.siteId };
  }
  return {
    host: env.GSAM_EDITOR_HOST,
    origins: allowedHostOrigins(env.GSAM_EDITOR_ORIGINS, env.NODE_ENV === 'development'),
  };
}
