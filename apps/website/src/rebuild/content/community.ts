import type { Work } from '../types';

/** Three concept works; identical full-image sources are used by gallery and bridge. */
export const communityWorks: readonly Work[] = [
  { id: 'community-travel', title: 'Travel Planner', description: 'A little local knowledge. A whole world to explore.', src: '/rebuild/community/travel.webp', category: 'Travel & discovery', skills: ['Research', 'Travel planning', 'Translation'], crop: {x:0,y:0,w:1,h:1} },
  { id: 'community-companion', title: 'Everyday Companion', description: 'A familiar presence for the moments in between.', src: '/rebuild/community/companion.webp', category: 'Everyday life', skills: ['Memory', 'Conversation', 'Scheduling'], crop: {x:0,y:0,w:1,h:1} },
  { id: 'community-writer', title: 'Creative Writer', description: 'Find the words. Follow your imagination.', src: '/rebuild/community/writer.webp', category: 'Creative tools', skills: ['Writing', 'Research', 'Editing'], crop: {x:0,y:0,w:1,h:1} },
];

export const communityPeople = [
  { id:'creator-curly', src:'/rebuild/community/person-1.webp', greeting:'Hello' },
  { id:'creator-bun', src:'/rebuild/community/person-2.webp', greeting:'你好' },
  { id:'creator-glasses', src:'/rebuild/community/person-3.webp', greeting:'Hola' },
  { id:'creator-silver', src:'/rebuild/community/person-4.webp', greeting:'' },
  { id:'creator-headphones', src:'/rebuild/community/person-5.webp', greeting:'Bonjour' },
] as const;

export const communityAssetVersion = 'm03-production-v1';
