const FORM_TYPES = new Set(['BookDeepDive', 'AiBaselineSurvey', 'AiCostCalculator']);
const BOOK_FIELDS = { name: 'text', email: 'email', company: 'text', size: 'select', sector: 'select', interest: 'select', message: 'textarea' };
const TOOL_FIELDS = { name: 'text', email: 'email', company: 'text' };

const labels = {
  name: 'nameLabel', email: 'emailLabel', company: 'companyLabel',
  size: 'sizeLabel', sector: 'sectorLabel', interest: 'interestLabel', message: 'messageLabel',
};

export function bindFormBlock(pageSlug, block, forms) {
  if (!FORM_TYPES.has(block.type)) return block.props;
  const key = block.props.formKey || `${pageSlug}-${block.type.toLowerCase()}`;
  const definition = forms?.entries?.find((entry) => entry.fields?.key === key)?.fields;
  if (!definition) return block.props;

  const props = { ...block.props, submitLabel: definition.submitLabel, formFields: {} };
  if (definition.title) props[block.type === 'BookDeepDive' ? 'headline' : 'gateHeading'] = definition.title;
  if (definition.intro) props[block.type === 'BookDeepDive' ? 'body' : 'gateBody'] = definition.intro;
  for (const field of definition.fields) {
    props.formFields[field.key] = field;
    if (labels[field.key]) props[labels[field.key]] = field.label;
    if (field.placeholder && field.key === 'message') props.messagePlaceholder = field.placeholder;
    if (field.placeholder && field.key === 'size') props.sizePlaceholder = field.placeholder;
    if (field.placeholder && field.key === 'sector') props.sectorPlaceholder = field.placeholder;
    if (field.placeholder && field.key === 'interest') props.interestPlaceholder = field.placeholder;
    if (field.options && field.key === 'size') props.sizes = field.options;
    if (field.options && field.key === 'sector') props.sectors = field.options;
    if (field.options && field.key === 'interest') props.interests = field.options;
  }
  return props;
}

export function formBindingProblem(release) {
  const entries = release.collections?.forms?.entries || [];
  const keys = entries.map((entry) => entry.fields.key);
  if (new Set(keys).size !== keys.length) return 'Duplicate form key';
  for (const page of release.pages) for (const block of page.data.content) {
    if (!FORM_TYPES.has(block.type)) continue;
    const key = block.props.formKey || `${page.slug}-${block.type.toLowerCase()}`;
    const form = entries.find((entry) => entry.fields.key === key)?.fields;
    if (!form) continue;
    const allowed = block.type === 'BookDeepDive' ? BOOK_FIELDS : TOOL_FIELDS;
    const seen = new Set();
    for (const field of form.fields) {
      if (seen.has(field.key) || allowed[field.key] !== field.type) return `Unsupported or duplicate field in form ${key}: ${field.key}`;
      if (field.type === 'select' && !field.options.length) return `Select field has no options in form ${key}: ${field.key}`;
      seen.add(field.key);
    }
    if (!seen.has('name') || !seen.has('email') ||
        !form.fields.find((field) => field.key === 'name').required ||
        !form.fields.find((field) => field.key === 'email').required) return `Name and email must remain required in form ${key}`;
  }
  return null;
}
