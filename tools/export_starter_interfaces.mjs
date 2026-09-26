/** Export local editable source packages, not installers or activated host code. */
import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {defaultSource,validateSource} from '../apps/desktop/product/interface/builder.mjs'
import {availableStarterIds} from '../apps/desktop/personal-space/starter-config.mjs'
const root=fileURLToPath(new URL('..',import.meta.url))
const out=path.join(root,'outputs','starter-interfaces')
await fs.mkdir(out,{recursive:true})
for(const starter of availableStarterIds){
  const source=validateSource(await defaultSource({starter,standalone:true}))
  await fs.writeFile(path.join(out,`${starter}.morrow.json`),JSON.stringify(source))
}
// The host reserves morrow.default for its built-in recovery source. An importable
// collection has its own identity; shared conversation/draft are still unchanged.
const collection=await defaultSource()
collection.id='morrow.collection'
await fs.writeFile(path.join(out,'morrow-collection.morrow.json'),JSON.stringify(validateSource(collection)))
await fs.writeFile(path.join(out,'README.md'),'# Editable initial interfaces\n\nFORM and ATELIER share conversations, drafts, and the same SDK. Open the running app → change appearance → manage interface source → import a .morrow.json source → preview → activate. These are source exports, not installers. Community character artwork is excluded.\n')
console.log(JSON.stringify({output:out,packages:availableStarterIds.length+1}))
