import { parse, parseFragment } from 'parse5'
import postcss from 'postcss'
import ts from 'typescript'
import { parse as parseJavaScript } from '@babel/parser'
import { FILES, sourceBytes, recordBytes, sha } from '../../core/package.mjs'

export const AUTHORING_VERSION = 'authoring-kit/1'
export const RULE_VERSION = 'authoring-validator/2'
const MAX_DIAGNOSTICS = 20
const enc = new TextEncoder()
export class AuthoringError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'AuthoringError' }
}
const point = (line, column, offset) => ({ line, column, offset })
const at = (text, offset) => {
  const prefix = text.slice(0, offset)
  const lines = prefix.split('\n')
  return point(lines.length, lines.at(-1).length + 1, offset)
}
const fixedMessage = value => String(value).slice(0, 180)

// This is the supported runtime format, not TypeScript's tolerant JS AST mode.
export function parseClassicScript(source) {
  try {
    parseJavaScript(source, { sourceType:'script', plugins:[], errorRecovery:false,
      allowReturnOutsideFunction:false, allowAwaitOutsideFunction:false,
      allowImportExportEverywhere:false })
    return null
  } catch (cause) {
    return { offset:Number.isInteger(cause.pos) ? cause.pos : 0,
      message:fixedMessage(cause.reasonCode || cause.message || 'Invalid classic script syntax.') }
  }
}

export function authorSourceHash(files) {
  const bytes = sourceBytes(files)
  return sha(recordBytes([['format', enc.encode(AUTHORING_VERSION)],
    ...FILES.map(name => [name, bytes[name]])]))
}
export function validateAuthor(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join('|') !== 'files|format'
    || input.format !== AUTHORING_VERSION) throw new AuthoringError('invalid_authoring_input')
  const files = input.files
  try { sourceBytes(files) } catch (cause) { throw new AuthoringError(cause.code || 'invalid_source') }
  const diagnostics = []
  const add = (code, severity, file, start, end, message) => {
    if (diagnostics.length >= MAX_DIAGNOSTICS) return
    diagnostics.push({ code, severity, file, start:at(files[file], Math.max(0,start)),
      end:at(files[file], Math.max(start,end)), message:fixedMessage(message), rule_version:RULE_VERSION })
  }
  const html = files['view.html']
  const parserErrors = []
  parseFragment(html, { sourceCodeLocationInfo:true, onParseError: e => parserErrors.push(e) })
  for (const e of parserErrors.slice(0, 5))
    add('html_parse', 'error', 'view.html', e.startOffset, e.endOffset, e.code)
  const document = parse(html, { sourceCodeLocationInfo:true })
  function walk(node) {
    const tag = node.tagName?.toLowerCase()
    const loc = node.sourceCodeLocation
    if (loc && (node.nodeName === '#documentType' || ['html','head','body','script'].includes(tag)))
      add('html_fragment_only', 'error', 'view.html', loc.startOffset, loc.endOffset,
        'Use a body fragment; document wrappers and scripts are unsupported.')
    if (loc && tag === 'link') add('external_stylesheet', 'error', 'view.html', loc.startOffset, loc.endOffset,
      'External stylesheets and link resources are unsupported.')
    if (loc && node.attrs) for (const attr of node.attrs) {
      const name = attr.name.toLowerCase()
      if (['src','srcset','poster','href','xlink:href'].includes(name)
        && (tag !== 'a' || name !== 'href') && !attr.value.startsWith('data:')
        && !attr.value.startsWith('#')) {
        const attrLoc = loc.attrs?.[attr.name] || loc
        add('external_resource', 'error', 'view.html', attrLoc.startOffset, attrLoc.endOffset,
          'External resource references are unsupported.')
      }
    }
    for (const child of node.childNodes || []) walk(child)
    if (node.content) walk(node.content)
  }
  walk(document)
  const css = files['view.css']
  try {
    const root = postcss.parse(css, { from:'view.css' })
    root.walkAtRules(rule => {
      if (rule.name.toLowerCase() === 'import') {
        const start = rule.source?.start?.offset ?? 0
        add('css_import', 'error', 'view.css', start, start + rule.toString().length,
          'CSS @import is unsupported.')
      }
    })
    root.walkDecls(decl => {
      if (/url\s*\(/i.test(decl.value)) {
        const start = decl.source?.start?.offset ?? 0
        add('css_resource', 'error', 'view.css', start, start + decl.toString().length,
          'CSS resource URLs are unsupported.')
      }
    })
  } catch (cause) {
    const offset = cause?.line && cause?.column
      ? css.split('\n').slice(0,cause.line-1).reduce((n,line) => n + line.length + 1,0) + cause.column - 1 : 0
    add('css_parse', 'error', 'view.css', offset, offset + 1, 'CSS syntax error.')
  }
  const js = files['view.js']
  const syntax = parseClassicScript(js)
  if (syntax) add('js_parse', 'error', 'view.js', syntax.offset, syntax.offset + 1, syntax.message)
  const tree = ts.createSourceFile('view.js', js, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  let bridgeFound = false
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node) || ts.isExportAssignment(node)
      || ts.isImportEqualsDeclaration(node) || ts.isImportTypeNode(node)
      || (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      || (node.modifiers && node.modifiers.some(m => m.kind === ts.SyntaxKind.ExportKeyword)))
      add('module_unsupported', 'error', 'view.js', node.getStart(tree), node.getEnd(),
        'Classic script only; import/export is unsupported.')
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'postMessage' && !bridgeFound) {
      bridgeFound = true
      add('raw_bridge', 'error', 'view.js', node.getStart(tree), node.getEnd(),
        'Use window.PersonalSpace.connect(), subscribe(), and saveDraft() instead of raw postMessage.')
    }
    if (ts.isPropertyAccessExpression(node) && node.name.text === 'binding'
      && ts.isIdentifier(node.expression) && node.expression.text === 'data')
      add('legacy_init_binding', 'error', 'view.js', node.getStart(tree), node.getEnd(),
        'Init fields are top-level; use window.PersonalSpace instead of data.binding.')
    ts.forEachChild(node, visit)
  }
  visit(tree)
  if (/<\/script\b/i.test(js)) add('embedded_closing_tag', 'error', 'view.js',
    js.search(/<\/script\b/i), js.search(/<\/script\b/i)+8, 'Closing script tag is unsupported.')
  if (/<\/style\b/i.test(css)) add('embedded_closing_tag', 'error', 'view.css',
    css.search(/<\/style\b/i), css.search(/<\/style\b/i)+7, 'Closing style tag is unsupported.')
  return { format:AUTHORING_VERSION, rule_version:RULE_VERSION,
    source_hash:authorSourceHash(files), source_validation:diagnostics.some(d => d.severity === 'error') ? 'failed' : 'passed',
    diagnostics, execution_validation:'not_run', native_validation:'not_run', visual_validation:'not_run' }
}
