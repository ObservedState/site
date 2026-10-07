import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import {
  DIRECTIONS,
  FORMATS,
  HUB_AREAS,
  LEVELS,
  MECHANISMS,
  SPOKES,
  STEP_KINDS,
} from './data/taxonomy';

// Posts. Files starting with "_" are ignored by the loader.
const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    hub: z.enum(HUB_AREAS),
    spokes: z.array(z.enum(SPOKES)).default([]),
    level: z.enum(LEVELS).default('practitioner'),
    format: z.enum(FORMATS).default('field-note'),
    // Drafts render in `npm run dev` only. They are left out of production builds.
    draft: z.boolean().default(false),
  }),
});

// Integration patterns: one page per pattern, all using the same template.
const patterns = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/patterns' }),
  schema: z.object({
    title: z.string(),
    summary: z.string().max(240),
    direction: z.enum(DIRECTIONS),
    mechanism: z.array(z.enum(MECHANISMS)).min(1),
    ciClasses: z.array(z.string()).default([]),
    identificationKeys: z.array(z.string()).default([]),
    spokes: z.array(z.enum(SPOKES)).default([]),
    updatedDate: z.coerce.date().optional(),
    draft: z.boolean().default(false),
  }),
});

// Learning paths: an ordered list of steps, each one a read, build, cert or write-up.
const paths = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/paths' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(240),
    audience: z.string(),
    level: z.enum(LEVELS).default('practitioner'),
    spokes: z.array(z.enum(SPOKES)).default([]),
    order: z.number().default(0),
    steps: z
      .array(
        z.object({
          title: z.string(),
          kind: z.enum(STEP_KINDS),
          note: z.string().optional(),
          url: z.string().url().optional(),
        }),
      )
      .default([]),
    draft: z.boolean().default(false),
  }),
});

export const collections = { writing, patterns, paths };
