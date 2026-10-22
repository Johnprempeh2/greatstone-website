'use client';

import { useState } from 'react';

const platforms = ['.NET', 'Java', 'C++', 'Python', 'Android', 'JasperReports', 'Reporting Services', 'SharePoint'];

export default function CatalogueFilters({ vendors, categories, filters }) {
  const [open, setOpen] = useState(false);
  return <><button className="st-filterbtn" type="button" aria-expanded={open} aria-controls="st-facets" onClick={() => setOpen((value) => !value)}>Filters</button>
    <aside id="st-facets" className={'st-facets' + (open ? ' open' : '')} aria-label="Filters">
      <div className="st-facet"><div className="st-facet-head"><h2>Vendor</h2><a className="st-clear" href="/shop">Clear all</a></div><div className="st-pills">{vendors.map((vendor) => <a key={vendor.id} className={'st-pill' + (filters.vendor === vendor.slug ? ' on' : '')} aria-current={filters.vendor === vendor.slug ? 'page' : undefined} href={'/shop/' + encodeURIComponent(vendor.slug)}>{vendor.name}</a>)}</div></div>
      <div className="st-facet"><h2>Platform</h2><div className="st-pills">{platforms.map((platform) => <a key={platform} className={'st-pill' + (filters.platform === platform ? ' on' : '')} href={'/shop?platform=' + encodeURIComponent(platform)}>{platform}</a>)}</div></div>
      <div className="st-facet"><h2>Category</h2><div className="st-pills">{categories.map((category) => <a key={category.id} className={'st-pill' + (filters.category === category.slug ? ' on' : '')} href={'/shop?category=' + encodeURIComponent(category.slug)}>{category.name}</a>)}</div></div>
    </aside></>;
}
