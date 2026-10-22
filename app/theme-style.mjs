const tokenPattern = /^[a-z][a-z0-9]*(?:\.[a-z0-9][a-z0-9-]*){0,4}$/;
const valuePattern = /^[^;{}<>\\"'`@]*$/;

export function themeStyle(tokens) {
  return Object.fromEntries(Object.entries(tokens).map(([name, value]) => {
    if (!tokenPattern.test(name) || !(
      typeof value === 'number' ||
      (typeof value === 'string' && value.length <= 200 && valuePattern.test(value) && !/(url|expression|image-set)\s*\(|javascript:/i.test(value))
    )) throw new Error(`Invalid release theme token: ${name}`);
    return [`--${name.replaceAll('.', '-')}`, value];
  }));
}
