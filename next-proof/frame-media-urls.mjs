export function useInsertedMediaUrl(mediaUrls, mediaRef, media, assetUrl) {
  if (media?.blob instanceof Blob) {
    const previous = mediaUrls[mediaRef];
    const url = URL.createObjectURL(media.blob);
    mediaUrls[mediaRef] = url;
    if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
  } else if (!mediaUrls[mediaRef]) {
    mediaUrls[mediaRef] = assetUrl;
  }
  return mediaUrls[mediaRef];
}
