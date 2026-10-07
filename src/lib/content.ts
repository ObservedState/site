import { getCollection, type CollectionEntry } from 'astro:content';

type CollectionName = 'writing' | 'patterns' | 'paths';

// Drafts show in `npm run dev` and are dropped from production builds.
export async function getPublished<T extends CollectionName>(name: T): Promise<CollectionEntry<T>[]> {
  const entries = await getCollection(name);
  return entries.filter((entry) => import.meta.env.DEV || !entry.data.draft);
}

export function byDateDesc(a: CollectionEntry<'writing'>, b: CollectionEntry<'writing'>): number {
  return b.data.pubDate.valueOf() - a.data.pubDate.valueOf();
}
