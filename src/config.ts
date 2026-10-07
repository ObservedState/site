// Site-wide constants. Change copy here, not in the templates.
export const SITE = {
  name: 'ObservedState',
  domain: 'observedstate.dev',
  url: 'https://observedstate.dev',
  tagline: 'Where the CMDB meets reality.',
  description:
    'ServiceNow ITOM and the CMDB at the center, with cloud, infrastructure as code, monitoring and data integrations around it, and the learning paths between them.',
  // Byline used in feeds and article metadata. Change to whatever name you want public.
  author: 'John Jones',
  github: 'https://github.com/ObservedState',
  ogImage: '/og-card.png',
} as const;

export const NAV = [
  { href: '/writing/', label: 'Writing' },
  { href: '/hub/', label: 'Hub' },
  { href: '/spokes/', label: 'Spokes' },
  { href: '/patterns/', label: 'Patterns' },
  { href: '/paths/', label: 'Paths' },
  { href: '/drift-log/', label: 'Drift Log' },
  { href: '/about/', label: 'About' },
] as const;
