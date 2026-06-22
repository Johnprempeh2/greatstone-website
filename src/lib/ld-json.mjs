// Serialize a JSON-LD object for safe injection into <script type="application/ld+json">.
// JSON.stringify alone does NOT neutralize "</script>" or other HTML in string values, so a free-text
// field (a product name, a CSV-imported description, an editable FAQ answer) could break out of the
// <script> element and run as a stored XSS. Escaping <, >, & to their \uXXXX forms keeps the output
// valid JSON-LD (crawlers parse it identically) while making it inert as HTML. Single source of truth
// for every JSON-LD sink in the app.
export function ldScript(ld) {
  return JSON.stringify(ld)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
