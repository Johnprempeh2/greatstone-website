// The shop grouped by use case (GRE-1862, John 6 Nov). Each use case gathers catalogue categories by
// the job a buyer has to do. A product whose category is not listed falls into the last group.
export const USE_CASES = [
  { slug: 'pdf', name: 'Work with PDFs', line: 'View, edit, annotate, sign and protect PDF files.', categories: ['pdf', 'editing', 'viewing', 'annotation', 'merge-and-split', 'watermarking', 'comparison', 'metadata', 'printing', 'signing-and-e-sign'] },
  { slug: 'convert', name: 'Convert and create documents', line: 'Turn Word, Excel, PowerPoint, email and web pages into the format you need.', categories: ['conversion', 'word-processing', 'spreadsheets', 'presentations', 'email', 'web-and-html', 'typesetting', 'archiving-and-compression'] },
  { slug: 'capture', name: 'Capture and extract data', line: 'Read scans, barcodes, forms and images, and pull out the data inside.', categories: ['ocr-and-recognition', 'omr', 'barcode-and-qr', 'parsing-and-extraction', 'imaging-and-graphics', 'search'] },
  { slug: 'automate', name: 'Automate documents and reports', line: 'Generate documents, diagrams and plans from your own data.', categories: ['document-automation', 'diagrams', 'project-management', 'note-taking'] },
  { slug: 'build', name: 'Build and test applications', line: 'UI components and testing tools for your developers.', categories: ['ui-components', 'testing-and-qa'] },
  { slug: 'suites', name: 'Suites, bundles and support', line: 'Whole product families in one licence, and the support around them.', categories: ['suites-and-bundles', 'support-and-services'] },
];

const fallback = USE_CASES[USE_CASES.length - 1];

export function useCaseOf(item) {
  const category = item?.category?.slug;
  return USE_CASES.find((useCase) => useCase.categories.includes(category)) || fallback;
}

export function filterByUseCase(rows, slug) {
  if (!slug) return rows;
  return rows.filter((item) => useCaseOf(item).slug === slug);
}

// Groups in USE_CASES order, keeping each group's rows in the order given; empty groups are left out.
export function groupByUseCase(rows) {
  return USE_CASES
    .map((useCase) => ({ ...useCase, rows: rows.filter((item) => useCaseOf(item) === useCase) }))
    .filter((group) => group.rows.length);
}

// The shop shows use case groups on its plain view: no search, category, platform or use case
// filter, and the featured order. A vendor page is still grouped.
export function showsGroups(filters = {}) {
  return !filters.q && !filters.category && !filters.platform && !filters.usecase && (!filters.sort || filters.sort === 'featured');
}

export function useCaseHref(filters = {}, slug = '') {
  const query = new URLSearchParams();
  if (filters.vendor) query.set('vendor', filters.vendor);
  if (slug) query.set('usecase', slug);
  if (!slug && filters.vendor) return '/shop/' + encodeURIComponent(filters.vendor);
  return '/shop' + (query.size ? '?' + query : '');
}
