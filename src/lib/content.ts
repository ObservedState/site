import { getCollection, type CollectionEntry } from 'astro:content';

type CollectionName = 'writing' | 'patterns' | 'paths' | 'notes';

// Drafts show in `npm run dev` and are dropped from production builds.
export async function getPublished<T extends CollectionName>(name: T): Promise<CollectionEntry<T>[]> {
  const entries = await getCollection(name);
  return entries.filter((entry) => import.meta.env.DEV || !entry.data.draft);
}

// Works for any dated collection (writing, notes).
export function byDateDesc<T extends { data: { pubDate: Date } }>(a: T, b: T): number {
  return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}
