import { artworks } from '../../lib/content';
import { communityWorks } from './community';

export type GalleryAsset = {
  id: string; title: string; src: string; description: string; skills: string[];
  tier: 'near' | 'middle' | 'restricted' | 'community';
  crop?: { x: number; y: number; w: number; h: number };
};
const closeups = new Set(['milo', 'orbit', 'luna', 'frame', 'fieldnotes', 'studio-moss', 'terminal-one', 'atelier']);
const restricted = new Set(['koi', 'good-company', 'commonplace']);
export const galleryAssets: GalleryAsset[] = artworks.map(a => ({
  id: a.id, title: a.title, description: a.description, skills: a.skills,
  tier: closeups.has(a.id) ? 'near' : restricted.has(a.id) ? 'restricted' : 'middle',
  src: closeups.has(a.id) ? `/rebuild/gallery/${a.id}-1200.webp` : a.src,
  crop: closeups.has(a.id) ? undefined : a.crop,
}));
export const galleryCommunityAssets: GalleryAsset[] = communityWorks.map(work => ({id:work.id,title:work.title,src:work.src,description:work.description,skills:[...work.skills],tier:'community'}));
export const galleryCatalog = [...galleryAssets, ...galleryCommunityAssets];
export const galleryAssetById = new Map(galleryCatalog.map(asset => [asset.id, asset]));
export const galleryHandoffCatalog: Record<string, string> = {
  'gallery-frame': 'frame', 'gallery-fieldnotes': 'fieldnotes',
  'community-travel': 'community-travel', 'community-companion': 'community-companion', 'community-writer': 'community-writer',
};
