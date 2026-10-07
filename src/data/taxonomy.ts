// The site's taxonomy. Every post is tagged with:
//   hub    - which part of the ServiceNow platform it is about (one)
//   spokes - which integration areas it touches (zero or more)
//   level  - intro / practitioner / architect
//   format - field note, deep dive, teardown, reference, drift log
// The content schemas (src/content.config.ts) are built from these lists,
// so a typo in frontmatter fails the build instead of silently creating a new tag.

export const HUB_AREAS = ['cmdb', 'discovery', 'event-management', 'service-mapping', 'platform'] as const;
export type HubArea = (typeof HUB_AREAS)[number];

export const hubAreaMeta: Record<HubArea, { label: string; blurb: string }> = {
  cmdb: {
    label: 'CMDB & data model',
    blurb: 'CSDM, CI classes, identification and reconciliation, and keeping the data honest.',
  },
  discovery: {
    label: 'Discovery',
    blurb: 'Probes, patterns, MID Servers, credentials and schedules.',
  },
  'event-management': {
    label: 'Event Management',
    blurb: 'Ingestion, correlation, alert-to-CI binding and noise reduction.',
  },
  'service-mapping': {
    label: 'Service Mapping',
    blurb: 'Application services, entry points and top-down maps.',
  },
  platform: {
    label: 'Platform architecture',
    blurb: 'Instance design, governance, upgrades and the decisions that are hard to undo.',
  },
};

export const SPOKES = ['cloud', 'iac', 'monitoring', 'data', 'automation-ai'] as const;
export type Spoke = (typeof SPOKES)[number];

export const spokeMeta: Record<Spoke, { label: string; role: string; blurb: string }> = {
  cloud: {
    label: 'Cloud providers',
    role: 'Observed state',
    blurb:
      'AWS first, then Azure and GCP: how cloud inventory reaches the CMDB, and what the provider APIs actually tell you.',
  },
  iac: {
    label: 'Infrastructure as Code',
    role: 'Desired state',
    blurb:
      'Terraform, CloudFormation and friends: declaring what should exist, and keeping that declaration honest against what does.',
  },
  monitoring: {
    label: 'Monitoring & observability',
    role: 'Observed signals',
    blurb: 'Metrics, logs, traces and alerts feeding Event Management without drowning it.',
  },
  data: {
    label: 'Data integration',
    role: 'The plumbing',
    blurb:
      'Service Graph Connectors, IntegrationHub, APIs, source precedence, and consolidating many tools into one platform.',
  },
  'automation-ai': {
    label: 'Automation & AI',
    role: 'Acting on state',
    blurb: 'Flows, spokes and agents that change real infrastructure, and the guardrails that keep them honest.',
  },
};

export const LEVELS = ['intro', 'practitioner', 'architect'] as const;
export type Level = (typeof LEVELS)[number];
export const levelLabel: Record<Level, string> = {
  intro: 'Intro',
  practitioner: 'Practitioner',
  architect: 'Architect',
};

export const FORMATS = ['field-note', 'deep-dive', 'teardown', 'reference', 'drift-log'] as const;
export type Format = (typeof FORMATS)[number];
export const formatLabel: Record<Format, string> = {
  'field-note': 'Field note',
  'deep-dive': 'Deep dive',
  teardown: 'Teardown',
  reference: 'Reference',
  'drift-log': 'Drift Log',
};

// Integration-pattern catalog: how data or control moves between the hub and a spoke.
export const DIRECTIONS = ['inbound', 'outbound', 'bidirectional'] as const;
export const MECHANISMS = [
  'service-graph-connector',
  'integrationhub',
  'mid-server',
  'rest-api',
  'event-api',
  'discovery',
  'file-import',
  'other',
] as const;
export const mechanismLabel: Record<(typeof MECHANISMS)[number], string> = {
  'service-graph-connector': 'Service Graph Connector',
  integrationhub: 'IntegrationHub',
  'mid-server': 'MID Server',
  'rest-api': 'REST API',
  'event-api': 'Event API',
  discovery: 'Discovery',
  'file-import': 'File import',
  other: 'Other',
};

// Learning-path step kinds.
export const STEP_KINDS = ['read', 'build', 'cert', 'write'] as const;
export const stepKindLabel: Record<(typeof STEP_KINDS)[number], string> = {
  read: 'Read',
  build: 'Build',
  cert: 'Certify',
  write: 'Write up',
};
