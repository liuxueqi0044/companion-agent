import { describe, it, expect } from 'vitest'
import { validateAuthor, parseClassicScript, AUTHORING_VERSION } from './validate.mjs'
import { prepareBuild } from '../build/build.mjs'
import { makeManifest, sha } from '../../core/package.mjs'

const files = () => ({ 'view.html':'<main><h1>Demo</h1><svg><circle r="2"/></svg></main>',
  'view.css':'main { color: #222; }',
  'view.js':'window.PersonalSpace.connect().then(() => { document.querySelector("h1").textContent = "Ready" })' })
const check = content => validateAuthor({ format:AUTHORING_VERSION, files:content })
describe('author validation and deterministic build', () => {
  it('allows arbitrary fragment DOM/SVG/classic JS and binds separate source/effective hashes', () => {
    const input = { format:AUTHORING_VERSION, files:files() }
    const one = prepareBuild(input), two = prepareBuild(input)
    expect(one).toEqual(two)
    expect(one.author_source_hash).not.toBe(one.effective_source_hash)
    expect(one.files['view.js']).toContain('window.PersonalSpace = createClient()')
    expect(one.files['view.js']).toContain(input.files['view.js'])
    expect(one.artifact_hash).toBe(sha(one.artifact))
    expect(makeManifest({ package_id:'demo', revision_id:'rev1', base_revision:null,
      host_api_version:'demo/1', source_type:'handwritten_fixture', requested_scopes:[] },
      one.files).artifact_hash).toBe(one.artifact_hash)
    expect(one.source_validation.execution_validation).toBe('not_run')
    const edited = files(); edited['view.css'] += '\nmain { margin: 1rem }'
    expect(prepareBuild({ ...input, files:edited }).author_source_hash).not.toBe(one.author_source_hash)
  })
  it('rejects document wrappers and scripts with parse5 source positions, including prior model shape', () => {
    const f = files(); f['view.html'] = '<!doctype html><html><head><link rel="stylesheet" href="a.css"></head><body><script src="x.js"></script></body></html>'
    const result = check(f)
    expect(result.source_validation).toBe('failed')
    expect(result.diagnostics.filter(d => d.file === 'view.html').map(d => d.code)).toContain('html_fragment_only')
    expect(result.diagnostics.every(d => d.start.line >= 1 && d.start.offset >= 0)).toBe(true)
    expect(() => prepareBuild({ format:AUTHORING_VERSION, files:f })).toThrow('source_invalid')
  })
  it('locates CSS/JS syntax, modules, resources and legacy bridge without executing source', () => {
    const f = files(); f['view.css'] = 'x { color:'; f['view.js'] = 'import x from "a"; port.postMessage({type:"ready",binding:data.binding}); function () {'
    const result = check(f)
    expect(result.source_validation).toBe('failed')
    expect(result.diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'css_parse','js_parse','module_unsupported','raw_bridge','legacy_init_binding']))
    expect(result.diagnostics.every(d => d.message.length <= 180 && d.rule_version === 'authoring-validator/2')).toBe(true)
    const external = files(); external['view.html'] = '<img src="https://example.invalid/a.png">'
    external['view.css'] = '@import "x.css"; body { background: url(x.png) }'
    expect(check(external).diagnostics.map(d => d.code)).toEqual(expect.arrayContaining([
      'external_resource','css_import','css_resource']))
  })
  it('rejects invalid input, oversized files and Unicode scalar errors', () => {
    expect(() => check({ ...files(), 'view.js':'x'.repeat(32769) })).toThrow('file_too_large')
    expect(() => check({ ...files(), 'view.js':'\ud800' })).toThrow('invalid_unicode_scalar')
    expect(() => validateAuthor({ format:'unknown', files:files() })).toThrow('invalid_authoring_input')
  })
  it('rejects TS-only syntax, top-level return/await and modules as classic scripts with author locations', () => {
    const bad = ['const count: number = 1;', 'interface Foo {x:number};',
      'return 1;', 'await Promise.resolve();', 'import x from "x";',
      'export const value = 1;', 'const broken = ;']
    for (const script of bad) {
      const f = files(); f['view.js'] = '// author file\n' + script
      const result = check(f)
      expect(result.source_validation,script).toBe('failed')
      expect(result.diagnostics.some(d => d.code === 'js_parse' && d.file === 'view.js'
        && d.start.line === 2 && d.start.offset >= '// author file\n'.length),script).toBe(true)
      expect(() => prepareBuild({format:AUTHORING_VERSION,files:f}),script).toThrow('source_invalid')
    }
    const valid = files()
    valid['view.js'] = '// interface Foo and import are comments\nasync function okay() { await Promise.resolve() }\nconst data = { value: 1 }'
    expect(check(valid).source_validation).toBe('passed')
    const built = prepareBuild({format:AUTHORING_VERSION,files:valid})
    expect(parseClassicScript(built.files['view.js'])).toBeNull()
    expect(built.validator_hash).toMatch(/^[a-f0-9]{64}$/)
  })
})
