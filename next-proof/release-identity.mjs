export function releaseIdentity(env, baked) {
  // The editor alias uses the checked-in proof release even when the Netlify
  // site supplies production release IDs to every deploy context.
  if (env.GSAM_EDITOR_HOST) {
    return { siteId: baked.siteId, orgId: baked.orgId, readsCurrent: false };
  }
  return {
    siteId: env.GSAM_SITE_ID || baked.siteId,
    orgId: env.GSAM_ORG_ID || baked.orgId,
    readsCurrent: Boolean(env.GSAM_SITE_ID),
  };
}
