export type InspirationAsset = {
  id: string;
  src: string;
  title: string;
  category: string;
  description: string;
  skills: string[];
  crop?: { x: number; y: number; w: number; h: number };
};

type Category = 'Companions' | 'Creative' | 'Workspaces';
const categories: Category[] = ['Companions', 'Creative', 'Workspaces'];
let disposePrevious: (() => void) | undefined;

function categoryOf(value: string): Category {
  const match = categories.find((category) => category.toLowerCase() === value.toLowerCase());
  if (match) return match;
  if (/companion|character|pet|desktop/i.test(value)) return 'Companions';
  if (/creat|studio|art|video|music/i.test(value)) return 'Creative';
  return 'Workspaces';
}

function filename(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'my-creation';
}

/** An optional normalized crop addresses one cell of a shared concept atlas. */
function setArtworkImage(element: HTMLElement, asset: InspirationAsset): void {
  element.style.backgroundImage = `url(${JSON.stringify(asset.src)})`;
  const crop = asset.crop;
  if (crop && crop.w > 0 && crop.h > 0 && crop.w <= 1 && crop.h <= 1) {
    element.style.backgroundSize = `${100 / crop.w}% ${100 / crop.h}%`;
    element.style.backgroundPosition = `${crop.w === 1 ? 50 : crop.x / (1 - crop.w) * 100}% ${crop.h === 1 ? 50 : crop.y / (1 - crop.h) * 100}%`;
  } else {
    element.style.backgroundSize = 'cover';
    element.style.backgroundPosition = 'center';
  }
}

function downloadJson(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Wire the native dialogs once the page is mounted. Returns a cleanup function. */
export function initDialogs(assets: InspirationAsset[]): () => void {
  disposePrevious?.();
  const exploreElement = document.querySelector<HTMLDialogElement>('#morrow-explore');
  const downloadElement = document.querySelector<HTMLDialogElement>('#morrow-download');
  const shareElement = document.querySelector<HTMLDialogElement>('#morrow-share');
  if (!exploreElement || !downloadElement || !shareElement) return () => {};
  const explore = exploreElement;
  const download = downloadElement;
  const share = shareElement;

  const controller = new AbortController();
  const signal = controller.signal;
  const dialogs = [explore, download, share];
  const gallery = explore.querySelector<HTMLElement>('[data-explore-gallery]')!;
  const grid = explore.querySelector<HTMLElement>('[data-explore-grid]')!;
  const detail = explore.querySelector<HTMLElement>('[data-artwork-detail]')!;
  const artworkTitle = explore.querySelector<HTMLElement>('[data-artwork-title]')!;
  const artworkStatus = explore.querySelector<HTMLElement>('[data-artwork-status]')!;
  const form = share.querySelector<HTMLFormElement>('#morrow-draft-form')!;
  const draftStatus = share.querySelector<HTMLElement>('[data-draft-status]')!;
  let activeFilter = 'All';
  let currentArtwork: InspirationAsset | undefined;
  let returnFocus: HTMLElement | null = null;
  let artworkOpener: HTMLElement | null = null;
  let galleryScroll = 0;
  let previousOverflow = '';
  let locked = false;

  function announceState(open: boolean): void {
    window.dispatchEvent(new CustomEvent('dialog:change', { detail: { open } }));
  }

  function syncLock(): void {
    const open = dialogs.some((dialog) => dialog.open);
    if (open && !locked) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.dataset.morrowDialogOpen = 'true';
      locked = true;
      announceState(true);
    } else if (!open && locked) {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.morrowDialogOpen;
      locked = false;
      announceState(false);
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    }
  }

  function openDialog(dialog: HTMLDialogElement): void {
    if (!dialogs.some((item) => item.open)) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    // Native showModal provides focus trapping and Escape support.
    for (const item of dialogs) if (item !== dialog && item.open) item.close();
    if (!dialog.open) dialog.showModal();
    syncLock();
    dialog.scrollTop = 0;
  }

  function renderGallery(): void {
    const visible = assets.filter((asset) => activeFilter === 'All' || categoryOf(asset.category) === activeFilter);
    const cards = visible.map((asset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'explore-card';
      button.dataset.artworkId = asset.id;
      button.setAttribute('aria-label', `Explore ${asset.title}`);
      const picture = document.createElement('span');
      picture.className = 'explore-card-picture';
      const img = document.createElement('span');
      img.className = 'explore-card-image';
      img.setAttribute('aria-hidden', 'true');
      setArtworkImage(img, asset);
      picture.append(img);
      const caption = document.createElement('span');
      caption.className = 'explore-card-caption';
      const title = document.createElement('strong');
      title.textContent = asset.title;
      const category = document.createElement('small');
      category.textContent = categoryOf(asset.category);
      const arrow = document.createElement('span');
      arrow.className = 'explore-card-arrow';
      arrow.textContent = '↗';
      arrow.setAttribute('aria-hidden', 'true');
      caption.append(title, category, arrow);
      button.append(picture, caption);
      return button;
    });
    grid.replaceChildren(...cards);
    explore.querySelector<HTMLElement>('[data-explore-empty]')!.hidden = visible.length !== 0;
    explore.querySelector<HTMLElement>('[data-explore-count]')!.textContent = `${visible.length} ${visible.length === 1 ? 'possibility' : 'possibilities'} to explore`;
    explore.querySelectorAll<HTMLButtonElement>('[data-explore-filter]').forEach((button) => {
      const active = button.dataset.exploreFilter === activeFilter;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function showGallery(restoreFocus = false): void {
    gallery.hidden = false;
    detail.hidden = true;
    currentArtwork = undefined;
    explore.classList.remove('is-detail');
    if (restoreFocus) {
      explore.scrollTop = galleryScroll;
      if (artworkOpener?.isConnected && gallery.contains(artworkOpener)) artworkOpener.focus({ preventScroll: true });
      else explore.querySelector<HTMLButtonElement>('[data-explore-filter="All"]')?.focus({ preventScroll: true });
    }
  }

  function showArtwork(id: string): void {
    const artwork = assets.find((asset) => asset.id === id);
    if (!artwork) return;
    artworkOpener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    galleryScroll = explore.open && !gallery.hidden ? explore.scrollTop : 0;
    currentArtwork = artwork;
    const img = explore.querySelector<HTMLElement>('[data-artwork-image]')!;
    setArtworkImage(img, artwork);
    img.setAttribute('aria-label', `${artwork.title} — an AI assistant interface concept`);
    artworkTitle.textContent = artwork.title;
    explore.querySelector<HTMLElement>('[data-artwork-category]')!.textContent = categoryOf(artwork.category);
    explore.querySelector<HTMLElement>('[data-artwork-description]')!.textContent = artwork.description;
    const skills = artwork.skills.map((name) => {
      const li = document.createElement('li');
      li.textContent = name;
      return li;
    });
    explore.querySelector<HTMLElement>('[data-artwork-skills]')!.replaceChildren(...skills);
    artworkStatus.textContent = '';
    gallery.hidden = true;
    detail.hidden = false;
    explore.classList.add('is-detail');
    openDialog(explore);
    artworkTitle.focus({ preventScroll: true });
  }

  renderGallery();
  dialogs.forEach((dialog) => {
    // Allow this area to scroll independently while the cinematic page is paused.
    dialog.setAttribute('data-lenis-prevent', '');
    dialog.addEventListener('close', syncLock, { signal });
    dialog.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-dialog-close]')) dialog.close();
      if (target === dialog) {
        const bounds = dialog.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
      }
    }, { signal });
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLElement>('[data-open-explore], [data-open-download], [data-open-share]');
    if (!trigger) return;
    event.preventDefault();
    if (trigger.hasAttribute('data-open-explore')) {
      showGallery();
      openDialog(explore);
    } else if (trigger.hasAttribute('data-open-download')) openDialog(download);
    else openDialog(share);
  }, { signal });

  explore.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const filter = event.target.closest<HTMLButtonElement>('[data-explore-filter]');
    if (filter) {
      activeFilter = filter.dataset.exploreFilter || 'All';
      renderGallery();
      return;
    }
    const card = event.target.closest<HTMLElement>('[data-artwork-id]');
    if (card?.dataset.artworkId) showArtwork(card.dataset.artworkId);
    if (event.target.closest('[data-artwork-back]')) showGallery(true);
    if (event.target.closest('[data-artwork-download]') && currentArtwork) {
      downloadJson(`morrow-${filename(currentArtwork.title)}-inspiration.json`, {
        schema: 'morrow.inspiration.v1',
        kind: 'concept-recipe',
        title: currentArtwork.title,
        category: categoryOf(currentArtwork.category),
        description: currentArtwork.description,
        suggestedSkills: currentArtwork.skills,
        note: 'A visual inspiration recipe. This file is not an executable assistant or an installable skill bundle.',
      });
      artworkStatus.textContent = 'Your inspiration recipe is ready in your browser’s downloads.';
    }
  }, { signal });

  window.addEventListener('morrow:open-artwork', ((event: CustomEvent<{ id?: string }>) => {
    if (event.detail?.id) showArtwork(event.detail.id);
  }) as EventListener, { signal });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const titleInput = form.elements.namedItem('title') as HTMLInputElement;
    const descriptionInput = form.elements.namedItem('description') as HTMLTextAreaElement;
    titleInput.value = titleInput.value.trim();
    descriptionInput.value = descriptionInput.value.trim();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const title = String(data.get('title'));
    downloadJson(`morrow-${filename(title)}-draft.json`, {
      schema: 'morrow.creation-draft.v1',
      status: 'local-draft',
      title,
      description: String(data.get('description')),
      category: String(data.get('category')),
      sharingIntent: String(data.get('sharing')),
      createdAt: new Date().toISOString(),
      note: 'This is a local draft. It has not been uploaded, published, or listed for sale.',
    });
    draftStatus.textContent = 'Draft saved to your browser’s downloads as JSON. Nothing has been published.';
  }, { signal });
  form.addEventListener('reset', () => { draftStatus.textContent = ''; }, { signal });

  const dispose = () => {
    controller.abort();
    dialogs.forEach((dialog) => { if (dialog.open) dialog.close(); });
    syncLock();
    if (disposePrevious === dispose) disposePrevious = undefined;
  };
  disposePrevious = dispose;
  return dispose;
}
