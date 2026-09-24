/** Read-only BATCH-008 plan and fixed synthetic replay. No transport or live mode. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { projectCodexMessage, type ProjectionContext } from './codex_protocol.ts';

const target = {
  version: '0.156.0', tag: 'rust-v0.156.0',
  commit: 'fe74a774532af67b5a4a3dec03ce9469e17f89af',
};
const fixtureNames = new Set(['synthetic-lifecycle.json', 'synthetic-invalid.json']);
const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../reports/evidence/M00.5.01/fixtures');
type Writer = (line: string) => void;

export async function runCli(args: readonly string[], write: Writer = console.log): Promise<number> {
  if (args.length === 1 && args[0] === '--plan') {
    write(JSON.stringify({
      kind: 'read_only_plan', target,
      evidence: 'reports/evidence/M00.5.01/source-index.json',
      capabilities: ['initialize', 'thread/start', 'turn/start', 'turn/completed', 'turn/interrupt',
        'server_approval_requests', 'account/read', 'account/rateLimits/read'],
      gaps: ['no live server or account tested', 'product completion unverified',
        'cancel and disconnect behavior unverified', 'cost amount unavailable'],
      future_order: ['obtain separate live authorization', 'official authentication',
        'single bounded run', 'inspect artifact', 'cancel and reconcile exit',
        'disconnect and reconcile', 'read account/quota only if authorized'],
      live_entry_available: false,
    }));
    return 0;
  }
  if (args.length === 2 && args[0] === '--replay' && fixtureNames.has(args[1]!)) {
    const fixturePath = join(fixtureRoot, args[1]!);
    const raw = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown;
    if (!isFixture(raw)) { write('Invalid fixed synthetic fixture'); return 2; }
    write(JSON.stringify({ kind: 'synthetic_replay', target, fixture: args[1],
      observations: raw.events.map((event) => ({ label: event.label,
        observation: projectCodexMessage(event.message, event.context) })) }));
    return 0;
  }
  write('Usage: codex_connection.ts --plan | --replay synthetic-lifecycle.json | --replay synthetic-invalid.json');
  return 2;
}

type Fixture = { synthetic: true; events: Array<{ label: string; context: ProjectionContext; message: unknown }> };
function isFixture(value: unknown): value is Fixture {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return v.synthetic === true && Array.isArray(v.events) && v.events.every((event: unknown) =>
    event !== null && typeof event === 'object' && typeof (event as Record<string, unknown>).label === 'string'
    && typeof (event as Record<string, unknown>).context === 'object'
    && (event as Record<string, unknown>).context !== null);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error: unknown) => {
    console.error(`Fixed fixture replay failed: ${error instanceof Error ? error.name : 'unknown_error'}`);
    process.exitCode = 2;
  });
}
