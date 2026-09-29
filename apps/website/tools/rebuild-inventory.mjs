import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import ts from 'typescript';

const root=fileURLToPath(new URL('..',import.meta.url));
const destination=path.join(root,'docs/rebuild/artifacts/M07');
const posix=p=>p.replaceAll('\\','/');
const json=async p=>JSON.parse(await fs.readFile(path.join(root,p),'utf8'));
const exists=async p=>fs.access(p).then(()=>true,()=>false);
async function walk(dir){return(await Promise.all((await fs.readdir(dir,{withFileTypes:true})).map(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]))).flat()}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const countBytes=list=>list.reduce((sum,f)=>sum+f.bytes,0);
const number=n=>n.toLocaleString('en-US');
const mib=n=>(n/1024/1024).toFixed(3)+' MiB';
const provenance=new Map();
function add(p,meta){provenance.set(p,{...meta,sourcePath:posix(meta.sourcePath||meta.source||'')})}
for(const asset of (await json('docs/rebuild/artifacts/M02/assets.json')).assets)add(asset.src,asset);
for(const asset of await json('public/rebuild/community/manifest.json'))add(asset.src,asset);
for(const asset of (await json('public/rebuild/gallery/manifest.json')).assets)for(const variant of asset.variants)add(variant.src,{...asset,...variant});
for(const asset of await json('public/rebuild/fallback/manifest.json'))add(asset.src,{...asset,provenance:{kind:'generated',source:'Approved M01 built-in imagegen scene'}});
for(const asset of await json('public/art/manifest.json'))add(asset.src,{...asset,provenance:{kind:asset.kind,source:'Existing project concept image; local source preserved'}});
for(const name of ['gallery-fallback.webp','foliage-lower-left.webp'])add('/rebuild/gallery/'+name,{sourcePath:'docs/rebuild/artifacts/M01/assets/gallery-art-v1.png',provenance:{kind:'generated',source:'Approved M01 gallery image; resized/cropped by tools/rebuild-gallery-assets.mjs'}});

async function fileRecord(file){
 const relative=posix(path.relative(root,file)),url='/'+posix(path.relative(path.join(root,'public'),file));
 const buffer=await fs.readFile(file),stat=await fs.stat(file),source=provenance.get(url);
 let dimensions={width:null,height:null,alpha:null};
 if(/\.(webp|png|avif|jpg|jpeg|svg)$/i.test(file)){const meta=await sharp(buffer).metadata();dimensions={width:meta.width||null,height:meta.height||null,alpha:meta.hasAlpha||false}}
 return {path:relative,url,bytes:buffer.length,...dimensions,sha256:sha(buffer),modifiedAt:stat.mtime.toISOString(),
   sourcePath:source?.sourcePath||(/\.json$/.test(file)?'tools/rebuild-*.mjs':null),sourceExists:source?.sourcePath?await exists(path.join(root,source.sourcePath)):null,
   provenance:source?.provenance||(/\.json$/.test(file)?{kind:'generated build metadata'}:{kind:'unrecorded'}),
   version:source?.version||source?.approvedVersion||null};
}
const published=[];for(const file of(await walk(path.join(root,'public/rebuild'))).sort())published.push(await fileRecord(file));

// Evaluate the real catalogue modules so template paths and close-up selections
// are validated without duplicating their IDs in this inventory.
async function codeUrl(relative,replacements={}){
 let code=ts.transpileModule(await fs.readFile(path.join(root,relative),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 for(const [from,to] of Object.entries(replacements))code=code.replaceAll(`'${from}'`,`'${to}'`).replaceAll(`"${from}"`,`"${to}"`);
 return 'data:text/javascript;base64,'+Buffer.from(code).toString('base64');
}
const legacyUrl=await codeUrl('src/lib/content.ts'),communityUrl=await codeUrl('src/rebuild/content/community.ts');
const galleryUrl=await codeUrl('src/rebuild/content/gallery.ts',{'../../lib/content':legacyUrl,'./community':communityUrl});
const {galleryCatalog,galleryAssets}=await import(galleryUrl),{communityPeople}=await import(communityUrl);
const requests=new Map();
const diagnosticPaths=new Map([['/rebuild/community/__diagnostic-missing-required-image.webp','Intentional failed request only when ?assetFail=community is supplied; validates complete scene fallback.']]);
function request(url,reason){if(!requests.has(url))requests.set(url,new Set());requests.get(url).add(reason)}
for(const asset of galleryCatalog)request(asset.src,`catalog:${asset.id}`);
for(const person of communityPeople)request(person.src,`person:${person.id}`);
for(const file of published.filter(f=>f.url.startsWith('/rebuild/hero/')&&f.width))request(file.url,'hero layers');
for(let i=1;i<=20;i++)request(`/rebuild/community/distant-${i}.webp`,'community distant field');
for(const p of ['/rebuild/community/set-clean.webp','/rebuild/community/ribbon.webp','/rebuild/gallery/gallery-fallback.webp','/rebuild/gallery/foliage-lower-left.webp'])request(p,'scene supporting/fallback art');
for(const file of(await walk(path.join(root,'src/rebuild'))).filter(p=>/\.(ts|css|astro)$/.test(p))){
 const source=await fs.readFile(file,'utf8');for(const match of source.matchAll(/["'`(](\/(?:rebuild|fonts)\/[^"'`\s)]+)["'`)]/g)){if(!match[1].includes('${')&&/\.(webp|png|avif|jpg|jpeg|svg|ttf|woff2?)$/i.test(match[1]))request(match[1],posix(path.relative(root,file)))}
}
const runtimeAssets=[];
for(const [url,reasons] of [...requests].sort(([a],[b])=>a.localeCompare(b))){
 const file=path.join(root,'public',url),found=await exists(file);
  const record={url,exists:found,reasons:[...reasons],...(found?await fileRecord(file):{bytes:0})};
  if(diagnosticPaths.has(url)){record.diagnosticOnly=true;record.diagnosticPurpose=diagnosticPaths.get(url)}
  if(/\.(ttf|woff2?)$/.test(url)){record.sourcePath=posix(path.relative(root,file));record.sourceExists=found;record.provenance={kind:'font',license:'SIL Open Font License 1.1',notice:url.includes('sans')?'/fonts/DM-Sans-OFL.txt':'/fonts/DM-Serif-Display-OFL.txt'}}
  runtimeAssets.push(record);
}
const missing=runtimeAssets.filter(f=>!f.exists&&!f.diagnosticOnly).map(f=>f.url);
const sourceMissing=published.filter(f=>f.sourceExists===false).map(f=>({url:f.url,sourcePath:f.sourcePath}));
const fonts=runtimeAssets.filter(f=>/\.(ttf|woff2?)$/.test(f.url)).map(f=>({...f,provenance:{kind:'font',license:'SIL Open Font License 1.1',notice:f.url.includes('sans')?'/fonts/DM-Sans-OFL.txt':'/fonts/DM-Serif-Display-OFL.txt'}}));
const hero=runtimeAssets.filter(f=>f.url.startsWith('/rebuild/hero/'));
const images=runtimeAssets.filter(f=>f.width);
const publishedImages=published.filter(f=>f.width);
const unusedImages=publishedImages.filter(f=>!requests.has(f.url));
const licensePaths={astro:'public/licenses/astro-MIT.txt',gsap:'public/licenses/gsap-NOTICE.txt',lenis:'public/licenses/lenis-MIT.txt',three:'public/licenses/three-MIT.txt',sharp:'public/licenses/sharp-Apache-2.0.txt'};
const pkg=await json('package.json');
const packages=[];
for(const [name,requestedVersion] of Object.entries({...pkg.dependencies,...pkg.devDependencies})){
 const metadata=await json(`node_modules/${name}/package.json`);
 packages.push({name,requestedVersion,installedVersion:metadata.version,license:metadata.license,scope:name in pkg.dependencies?'production/build dependency':'development/build dependency',notice:licensePaths[name]||null,noticeExists:licensePaths[name]?await exists(path.join(root,licensePaths[name])):null});
}

// Snapshot only: this tool never rebuilds dist and never declares it final.
const build={status:'no dist snapshot',entry:'dist/rebuild/index.html',builtEntryModifiedAt:null,js:[],css:[],rawJSBytes:0,gzipJSBytes:0,brotliJSBytes:0,rawCSSBytes:0};
const entry=path.join(root,build.entry);
if(await exists(entry)){
 build.status='existing dist snapshot; rerun inventory after the final build';build.builtEntryModifiedAt=(await fs.stat(entry)).mtime.toISOString();
 const html=await fs.readFile(entry,'utf8'),queue=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"/g)].map(m=>path.join(root,'dist',m[1]));
 const visited=new Set();
 while(queue.length){const file=queue.pop();if(visited.has(file))continue;visited.add(file);if(!await exists(file)){build.js.push({path:posix(path.relative(root,file)),missing:true});continue}
  const buffer=await fs.readFile(file),source=buffer.toString('utf8');
  build.js.push({path:posix(path.relative(root,file)),bytes:buffer.length,gzipBytes:zlib.gzipSync(buffer).length,brotliBytes:zlib.brotliCompressSync(buffer).length,sha256:sha(buffer),modifiedAt:(await fs.stat(file)).mtime.toISOString()});
  for(const m of source.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.\.?\/[^"']+\.js)["']/g))queue.push(path.resolve(path.dirname(file),m[1]));
 }
 for(const match of html.matchAll(/<link\b[^>]*href="([^"]+\.css)"/g)){const file=path.join(root,'dist',match[1]);if(!await exists(file))continue;const buffer=await fs.readFile(file);build.css.push({path:posix(path.relative(root,file)),bytes:buffer.length,gzipBytes:zlib.gzipSync(buffer).length,sha256:sha(buffer)})}
 build.rawJSBytes=countBytes(build.js.filter(f=>f.bytes));build.gzipJSBytes=build.js.reduce((n,f)=>n+(f.gzipBytes||0),0);build.brotliJSBytes=build.js.reduce((n,f)=>n+(f.brotliBytes||0),0);build.rawCSSBytes=countBytes(build.css);
}
const totals={publishedRebuildFiles:published.length,publishedRebuildBytes:countBytes(published),publishedRebuildImages:publishedImages.length,publishedRebuildImageBytes:countBytes(publishedImages),
 runtimeUniqueImages:images.length,runtimeImageBytes:countBytes(images),runtimeFonts:fonts.length,runtimeFontBytes:countBytes(fonts),heroImageBytes:countBytes(hero),
 heroImagesPlusFontsBytes:countBytes(hero)+countBytes(fonts),eagerFallbackHeroBytes:runtimeAssets.find(f=>f.url==='/rebuild/fallback/hero.webp')?.bytes||0,
 allReachableImagesAndFontsBytes:countBytes(images)+countBytes(fonts),unusedPublishedImages:unusedImages.length,unusedPublishedImageBytes:countBytes(unusedImages)};
const report={version:'m07-inventory-1',generatedAt:new Date().toISOString(),status:'Measured source/assets and an existing build snapshot; not a final release or measured network waterfall.',totals,
 verification:{missingRuntimePaths:missing,diagnosticMissingPaths:runtimeAssets.filter(f=>!f.exists&&f.diagnosticOnly).map(f=>({url:f.url,purpose:f.diagnosticPurpose})),missingSources:sourceMissing,galleryCatalogEntries:galleryCatalog.length,nearCatalogEntries:galleryAssets.filter(a=>a.tier==='near').length,communityPeople:communityPeople.length},
 published,runtimeAssets,fonts,unusedPublishedImages:unusedImages.map(f=>({url:f.url,bytes:f.bytes})),packages,build,
 budgetInterpretation:['Byte counts are unique local file sizes, not observed transferred bytes. Browser caching, lazy loading and content encoding change network totals.',
 'Hero images plus three requested fonts is a hero resource budget, not the entire startup download.',
 'The HTML also eagerly references the hero fallback poster. After hero decode, bootstrap creates gallery/community and starts their image/texture loads; those loads are not scroll-deferred.',
 '900 px gallery variants are published but current catalogue requests 1200 px versions. They are counted as published files, not active runtime requests.',
 'Existing generated legacy concept atlases under /art/ are counted in runtime totals even though they are outside public/rebuild.',
 'Gzip/Brotli sizes are local compression estimates; this inventory does not assert the hosting server enables them.']};
await fs.mkdir(destination,{recursive:true});await fs.writeFile(path.join(destination,'file-inventory.json'),JSON.stringify(report,null,2)+'\n');
const packageRows=packages.map(p=>`| ${p.name} | ${p.installedVersion} | ${String(p.license).replaceAll('|','/')} | ${p.notice?`[notice](../../../../${p.notice})`:'Installed package metadata'} |`).join('\n');
const groups=['hero','gallery','community','fallback'].map(group=>{const files=publishedImages.filter(f=>f.url.startsWith(`/rebuild/${group}/`));return `| ${group} | ${files.length} | ${number(countBytes(files))} | ${mib(countBytes(files))} |`}).join('\n');
const bt=String.fromCharCode(96);
const document=`# Assets, licenses and reproducible handoff

Measured ${report.generatedAt}. This inventory does not mark the site or its build as final. Full per-file dimensions, alpha, byte sizes, hashes, provenance and source paths are in [file-inventory.json](file-inventory.json).

## Image and font budget

| Published image group | Files | Bytes | Size |
|---|---:|---:|---:|
${groups}

- Hero's 6 images: **${number(totals.heroImageBytes)} bytes**. Three font files: **${number(totals.runtimeFontBytes)} bytes**. Combined hero/font set: **${number(totals.heroImagesPlusFontsBytes)} bytes (${mib(totals.heroImagesPlusFontsBytes)})**.
- The initial HTML also eagerly references the hero fallback poster: **${number(totals.eagerFallbackHeroBytes)} bytes**. This is additional to the hero layer set; it should not be omitted when estimating startup resources.
- All unique reachable images and fonts, including four legacy atlases outside ${bt}public/rebuild${bt}: **${number(totals.allReachableImagesAndFontsBytes)} bytes (${mib(totals.allReachableImagesAndFontsBytes)})**. This exceeds a 3 MB whole-site image/font pool; the smaller hero budget must not be presented as the full site budget.
- Bootstrap creates gallery and community after hero decode and starts their loads. These loads are currently eager after that boundary, not deferred until scrolling.
- ${totals.unusedPublishedImages} optional gallery 900 px variants (${number(totals.unusedPublishedImageBytes)} bytes) are present on disk but the current runtime catalogue uses the 1200 px variants.
- These are unique local-file counts, not a browser waterfall or performance claim. Fonts requested by the new runtime are DM Serif Display regular, DM Sans regular and DM Sans semibold; the legacy italic file is not counted as a new runtime font request.

## Provenance and retained masters

Hero and fallback art derive from the approved M01 images. The exact paper faces, cords, local cleanplate and original PNGs are retained in ${bt}source-art/rebuild/hero${bt}; rejected extraction trials do not ship. Community has independently generated scene/people/ribbon/work masters in ${bt}source-art/rebuild/community${bt}. Its twenty distant thumbnails reuse existing generated project concepts.

The eight foreground gallery interfaces are original project SVG UI designs with independent generated scene imagery, retained in ${bt}source-art/rebuild/gallery${bt} as SVG plus raster masters. Middle/far gallery cells reuse the existing generated atlases in ${bt}source-art/${bt}; they are not enlarged into foreground masters. No external stock photograph, purchased 3D asset, or fetched runtime image service was added for this rebuild.

Prompt records remain with the source art: [hero](../../../../source-art/rebuild/hero/prompts.json), [community](../../../../source-art/rebuild/community/prompts.json), [gallery](../../../../source-art/rebuild/gallery/generation-prompts.json). Generated art is recorded by origin; it is not mislabeled as third-party open-source artwork.

## Direct dependency notices

Versions and license identifiers below are read from the installed package metadata, not inferred from a website.

| Package | Installed version | Declared license | Local notice |
|---|---|---|---|
${packageRows}

GSAP's package declares its Standard “no charge” license; it is **not MIT**. Its [local copyright/reference notice](../../../../public/licenses/gsap-NOTICE.txt) links to the package's official terms. ScrollTrigger ships within that GSAP package/version.

DM Sans and DM Serif Display retain their SIL Open Font License 1.1 notices in [DM Sans OFL](../../../../public/fonts/DM-Sans-OFL.txt) and [DM Serif Display OFL](../../../../public/fonts/DM-Serif-Display-OFL.txt). Keep font notices and dependency notices in distributed copies. Build-only tooling also follows its installed package license; the table is a direct-dependency inventory, not an exhaustive transitive software bill of materials.

## Existing build snapshot

The inspected ${bt}${build.entry}${bt} has filesystem modification time **${build.builtEntryModifiedAt||'not present'}**. This is an existing build snapshot and may precede the latest source edits; the tool did not run a build.

The rebuild page's reachable JavaScript closure currently contains **${build.js.length} chunks**, **${number(build.rawJSBytes)} raw bytes**, approximately **${number(build.gzipJSBytes)} gzip bytes** or **${number(build.brotliJSBytes)} Brotli bytes**. Its ${build.css.length} linked CSS files contain **${number(build.rawCSSBytes)} raw bytes**. Compressed sizes are local estimates; server compression has not been measured. The JSON records each chunk hash and mtime so this snapshot cannot be mistaken for a later final build.

## Run and reproduce

Use Node.js **${pkg.engines.node}** and the checked-in lockfile in a normal project checkout:

${bt}${bt}${bt}sh
npm ci
npm run check
npm run build
npm run preview
${bt}${bt}${bt}

Preview defaults to ${bt}http://127.0.0.1:4332${bt}; the new scene route is ${bt}/rebuild/${bt}. Root integration decides the final home-page switch. The prepared WebP files are already local; a normal build needs no image-generation key or generation service.

After the final build, refresh this measured inventory with ${bt}node tools/rebuild-inventory.mjs${bt}. Optional source-asset rebuild scripts live under ${bt}tools/rebuild-*-assets.mjs${bt}. Run geometry/runtime regressions with ${bt}node tools/rebuild-geometry-test.mjs${bt}, ${bt}node tools/rebuild-runtime-check.mjs${bt} and the gallery motion check.

The present development checkout's ${bt}node_modules${bt} is a junction to shared local dependencies. Do not package that junction as project source. A clean recipient checkout should use ${bt}npm ci${bt}; this audit did not reinstall dependencies, archive files or rebuild the site.

## Path verification

The evaluated actual gallery catalogue has ${report.verification.galleryCatalogEntries} entries, including ${report.verification.nearCatalogEntries} new near-field assets. All dynamic community people/distant assets, catalogue URLs and literal scene/font URLs were checked: **${missing.length} missing normal runtime paths; ${sourceMissing.length} missing retained source paths**. One explicitly named missing-image URL is intentional and only selected by ${bt}?assetFail=community${bt}; it is separately recorded as a failure-test request. This inventory includes all ${published.length} files under ${bt}public/rebuild${bt}, including metadata manifests, and records real decoded dimensions for every image.
`;
await fs.writeFile(path.join(destination,'ASSETS-AND-LICENSES.md'),document);
console.log(JSON.stringify({totals,verification:report.verification,build:{status:build.status,builtEntryModifiedAt:build.builtEntryModifiedAt,chunks:build.js.length,rawJSBytes:build.rawJSBytes,gzipJSBytes:build.gzipJSBytes,rawCSSBytes:build.rawCSSBytes}},null,2));
process.exitCode=missing.length||sourceMissing.length?1:0;
