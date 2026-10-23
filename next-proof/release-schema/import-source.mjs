import catalogue from '../fixtures/public-catalogue-2026-10-22.json' with { type: 'json' };
import release from '../data/release.json' with { type: 'json' };

// This fixture is a dated public snapshot. It is not a production database export.
export const publicCatalogue = {
  capturedAt: catalogue.capturedAt,
  vendors: catalogue.vendors,
  categories: catalogue.categories,
  offerings: catalogue.offerings,
};

// Public page content is the source. Never import the Studio's private `team` roster.
export const publicPeople = release.pages
  .flatMap((page) => page.data.content.filter((block) => block.type === 'Team'))
  .flatMap((block) => block.props.items.map(({ name, role, kind, photo }) => ({
    name, role, kind, ...(photo ? { photo } : {}),
  })));

export const publicFormBlocks = release.pages.flatMap((page) => page.data.content
  .filter((block) => ['BookDeepDive', 'AiBaselineSurvey', 'AiCostCalculator'].includes(block.type))
  .map((block) => ({ pageSlug: page.slug, blockId: block.props.id, blockType: block.type,
    props: Object.fromEntries(Object.entries(block.props).filter(([key]) => key !== 'id' && !key.startsWith('_'))),
  })));

export const publicForms = publicFormBlocks.map(({ pageSlug, blockType, props }) => {
  const field = (key, label, type, required, options) => ({ key, label, type, required,
    ...(options ? { options: options.map(({ label: option }) => ({ value: option, label: option })) } : {}),
  });
  const fields = [field('name', props.nameLabel, 'text', true), field('email', props.emailLabel, 'email', true),
    field('company', props.companyLabel, 'text', false)];
  if (blockType === 'BookDeepDive') {
    fields.push(field('size', props.sizeLabel, 'select', false, props.sizes));
    if (props.showSector) fields.push(field('sector', props.sectorLabel, 'select', !!props.sectorRequired, props.sectors));
    fields.push(field('interest', props.interestLabel, 'select', false, props.interests));
    fields.push(field('message', props.messageLabel, 'textarea', false));
  }
  return { key: `${pageSlug}-${blockType.toLowerCase()}`, title: props.gateHeading || props.headline || props.heading,
    submitLabel: props.submitLabel, fields };
});
