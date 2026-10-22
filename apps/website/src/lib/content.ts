export type Artwork = {
  id: string; src: string; title: string;
  category: 'Companions' | 'Creative' | 'Workspaces';
  description: string; skills: string[];
  crop: { x: number; y: number; w: number; h: number };
};

const collections = [
  { file: 'companions', category: 'Companions', items: [
    ['Milo', 'A little company. A world of possibility.', 'A warm desktop companion that brings your conversations, plans and everyday ideas together.', ['Conversation', 'Personal notes', 'Daily planning']],
    ['Bloom', 'Room to think. Space to grow.', 'A quiet, illustrated space for reflecting, writing and working through your next idea.', ['Journaling', 'Writing', 'Reflection']],
    ['Orbit', 'A companion with a different gravity.', 'An imaginative little presence for a desktop that feels entirely your own.', ['Conversation', 'Reminders', 'Creative prompts']],
    ['Sunday', 'Make a little room for yourself.', 'A personal journal with a softer pace, built around your notes and everyday rituals.', ['Journaling', 'Notes', 'Planning']],
    ['Koi', 'Less noise. More flow.', 'A compact, calm assistant that keeps useful tools close and visual clutter away.', ['Quick notes', 'Tasks', 'Focus']],
    ['Nova', 'A familiar face for your next idea.', 'An expressive companion interface that gives your assistant a little more personality.', ['Conversation', 'Writing', 'Personalization']],
  ] },
  { file: 'creative', category: 'Creative', items: [
    ['Frame', 'From a folder of clips to a story.', 'An editing-focused assistant concept that brings research, scripts and video tools into one place.', ['Video editing', 'Script writing', 'Research']],
    ['Studio Moss', 'A fresh perspective on every brief.', 'A visual studio for collecting references, exploring directions and shaping a creative idea.', ['Visual research', 'Design direction', 'Writing']],
    ['Sonic', 'Find the sound of your next idea.', 'A music-oriented workspace for exploring moods, collecting references and developing a sound.', ['Audio tools', 'Creative research', 'Notes']],
    ['Canvas', 'A place for ideas that don’t fit a box.', 'A flexible, visual assistant canvas for sketching, collecting and making connections.', ['Ideation', 'Image tools', 'Organization']],
    ['Cut / 01', 'Make something move.', 'A minimal creative workspace for shaping footage and finding the story inside it.', ['Video editing', 'Captions', 'Planning']],
    ['Atelier', 'A story worth telling.', 'An editorial writing space that gives your words, research and revisions room to breathe.', ['Writing', 'Editing', 'Research']],
  ] },
  { file: 'workspaces', category: 'Workspaces', items: [
    ['Fieldnotes', 'Follow your curiosity.', 'A research notebook concept for connecting source material, observations and emerging ideas.', ['Research', 'Summarization', 'Notes']],
    ['Terminal / One', 'Build what comes next.', 'A focused interface for developers who want their tools and assistant to work their way.', ['Coding tools', 'Documentation', 'Project context']],
    ['Horizon', 'A little further from ordinary.', 'A travel-focused assistant concept for bringing places, plans and inspiration together.', ['Research', 'Itineraries', 'Organization']],
    ['Flow', 'Just the help you need, right here.', 'A lightweight floating toolbar that brings useful assistant actions into your day.', ['Quick actions', 'Tasks', 'Notes']],
    ['Good Company', 'Thoughtful replies, at your fingertips.', 'A customer-care workspace for organizing conversations and drafting helpful responses.', ['Customer care', 'Writing', 'Knowledge tools']],
    ['Signals', 'Make sense of a connected world.', 'A trade-focused workspace for collecting inquiries, researching context and preparing replies.', ['Trade research', 'Translation', 'Data organization']],
  ] },
  { file: 'possibilities', category: 'Companions', items: [
    ['Luna', 'Small presence. Big imagination.', 'A playful desktop companion concept with a gentle personality and a useful set of tools.', ['Conversation', 'Reminders', 'Notes']],
    ['Commonplace', 'Keep what stays with you.', 'A reading and knowledge space built around the ideas you want to come back to.', ['Reading', 'Summarization', 'Personal notes']],
    ['Spatial', 'Give your thinking another dimension.', 'An experimental spatial interface that arranges assistant tools around your work.', ['Workspace tools', 'Organization', 'Creative prompts']],
    ['Garden', 'Good things grow with a little attention.', 'A playful planning concept that brings a little warmth to habits and everyday goals.', ['Planning', 'Reminders', 'Journaling']],
    ['Muse', 'See it a little differently.', 'A photography-focused assistant concept for exploring imagery and developing a visual voice.', ['Image tools', 'Research', 'Organization']],
    ['Pocket', 'A whole assistant. A little footprint.', 'A compact side-panel concept that keeps conversations and quick tools within reach.', ['Conversation', 'Quick actions', 'Notes']],
  ] },
] as const;

const atlasRows:Record<string,number[]>={companions:[0,418/1254,836/1254,1],creative:[0,394/1254,778/1254,1],workspaces:[0,406/1254,827/1254,1],possibilities:[0,418/1254,836/1254,1]};
export const artworks: Artwork[] = collections.flatMap(collection => collection.items.map((item, i) => ({
  id: item[0].toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  title: item[0], src: `/art/${collection.file}.webp`,
  category: collection.category,
  description: item[2], skills: [...item[3]],
  crop: { x: (i % 2) * .5, y: atlasRows[collection.file][Math.floor(i/2)], w: .5, h: atlasRows[collection.file][Math.floor(i/2)+1]-atlasRows[collection.file][Math.floor(i/2)] },
})));

export function artworkStyle(art: Artwork) {
  const {x,y,w,h}=art.crop;
  return `background-image:url('${art.src}');background-size:${100/w}% ${100/h}%;background-position:${100*x/(1-w)}% ${100*y/(1-h)}%`;
}

export const skills = [
  { id:'video', title:'Video Editing', subtitle:'Find the story in your footage.', icon:'play', short:'Create', description:'Bring editing, captions and creative tools into your workflow.' },
  { id:'research', title:'Research', subtitle:'Follow an idea further.', icon:'compass', short:'Discover', description:'Connect research tools and keep useful sources close to your work.' },
  { id:'support', title:'Customer Care', subtitle:'Make every reply more helpful.', icon:'headphones', short:'Connect', description:'Organize customer questions and shape thoughtful replies.' },
  { id:'data', title:'Data & Tables', subtitle:'Make room for clarity.', icon:'table', short:'Organize', description:'Connect tools for organizing, reviewing and understanding data.' },
  { id:'writing', title:'Writing', subtitle:'Give your ideas a voice.', icon:'pen', short:'Express', description:'Explore, draft and refine words with the capabilities you choose.' },
  { id:'trade', title:'Trade Assist', subtitle:'Work across borders.', icon:'globe', short:'Explore', description:'Bring together inquiry research, language tools and useful context.' },
] as const;

export const iconPaths: Record<string,string> = {
  play:'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M10 8l6 4-6 4Z',
  compass:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M16 8l-2.5 5.5L8 16l2.5-5.5Z',
  headphones:'M4 14v-3a8 8 0 0 1 16 0v3 M4 12H3v8h4v-8Z M20 12h1v8h-4v-8Z M18 20q0 2-6 2',
  table:'M4 3h16v18H4Z M4 9h16 M4 15h16 M10 3v18',
  pen:'M4 20l1-6L17 2l5 5L10 19Z M5 14l5 5 M14 5l5 5 M3 22h18',
  globe:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z M2 12h20 M12 2c-7 6-7 14 0 20 7-6 7-14 0-20Z M4 6h16 M4 18h16',
};
