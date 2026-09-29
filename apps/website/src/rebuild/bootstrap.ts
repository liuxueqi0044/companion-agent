import {createHeroScene} from './scenes/HeroScene';
import {createGalleryScene} from './scenes/GalleryScene';
import {createCommunityScene} from './scenes/CommunityScene';
import {GalleryHost} from './runtime/GalleryHost';
import {StoryDirector} from './runtime/StoryDirector';
import {initDialogs} from './runtime/Actions';
import {galleryAssets} from './content/gallery';
import {communityWorks} from './content/community';
import {QualityPolicy} from './runtime/QualityPolicy';
import './styles/gallery.css';

export async function bootstrap(){
  const concepts=galleryAssets.filter(a=>a.tier!=='restricted').map(a=>({...a,category:/milo|orbit|luna|bloom|sunday|nova/.test(a.id)?'Companions':/frame|studio|sonic|canvas|cut|atelier|muse/.test(a.id)?'Creative':'Workspaces'}));
  const disposeDialogs=initDialogs([...concepts,...communityWorks.map(a=>({...a,category:a.id==='community-companion'?'Companions':a.id==='community-travel'?'Workspaces':'Creative',skills:[...a.skills]}))]);
  let disposed=false;
  let disposeVisuals=()=>{};
  const lifecycle=new AbortController();
  const cleanup=()=>{if(disposed)return;disposed=true;lifecycle.abort();disposeVisuals();disposeDialogs()};
  document.addEventListener('astro:before-swap',cleanup,{once:true,signal:lifecycle.signal});
  // Hard navigation also releases GPU resources. Preserve a BFCache snapshot:
  // destroying its scene on persisted pagehide would restore an empty page.
  window.addEventListener('pagehide',(event:PageTransitionEvent)=>{if(!event.persisted)cleanup()},{signal:lifecycle.signal});
  if(new QualityPolicy().staticMode){
    document.body.classList.add('is-enhanced','is-static');document.body.dataset.motionMode='reduced';
    document.body.dataset.assetsReady='static';document.body.dataset.paintReady='true';
    document.addEventListener('click',event=>{const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-story-goto]'):null;if(!target)return;event.preventDefault();document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());const id=target.dataset.storyGoto;document.querySelectorAll('.fallback-sections section')[id==='gallery'?1:id==='community'?2:0]?.scrollIntoView({behavior:'auto'})},{signal:lifecycle.signal});
    return;
  }
  const hero=createHeroScene(document.getElementById('hero-scene')!);
  disposeVisuals=()=>hero.dispose();
  await hero.ready;
  if(disposed)return;
  const galleryRoot=document.getElementById('gallery-scene')!;
  const host=new GalleryHost(galleryRoot);
  const community=createCommunityScene(document.getElementById('community-scene')!);
  const gallery=createGalleryScene(galleryRoot,host,id=>window.dispatchEvent(new CustomEvent('morrow:open-artwork',{detail:{id,opener:document.querySelector('.gallery-foot button')}})));
  document.body.classList.add('is-enhanced');
  const director=new StoryDirector({hero,gallery,community},host);
  disposeVisuals=()=>director.dispose();
  const hash=location.hash.slice(1);if(['hero','gallery','community'].includes(hash)&&!new URLSearchParams(location.search).has('frame'))director.go(hash as 'hero'|'gallery'|'community');
}
