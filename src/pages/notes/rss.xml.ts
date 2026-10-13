import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE } from '../../config';
import { byDateDesc, getPublished } from '../../lib/content';

// Separate feed for lab notes, so the main /rss.xml stays polished writing only.
export async function GET(context: APIContext) {
  const notes = (await getPublished('notes')).sort(byDateDesc);
  return rss({
    title: `${SITE.name} Lab Notes`,
    description: 'Rough working notes from study sessions and labs.',
    site: context.site!,
    items: notes.map((note) => ({
      title: note.data.title,
      description: note.data.summary,
      pubDate: note.data.pubDate,
      link: `/notes/${note.id}/`,
    })),
  });
}
