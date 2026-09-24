// Handwritten transport fixture. No model/network/user code is executed.
import { writeFileSync } from 'node:fs'

const mode = process.argv[2]
const marker = process.argv[3]
let raw = ''
for await (const chunk of process.stdin) raw += chunk.toString('utf8')
let request
try { request = JSON.parse(raw) } catch { process.exit(4) }
const response = (ok = true, result = { echo: request.payload }) =>
  JSON.stringify({ version: 'desktop-local/1', request_id: request.request_id,
    ok, result: ok ? result : null,
    error: ok ? null : { kind: 'business', code: 'conflict' } }) + '\n'

if (mode === 'sleep' || (mode === 'by-action' && request.action === 'worker.run-next')) {
  setTimeout(() => process.stdout.write(response()), 5000)
} else if (mode === 'malformed') process.stdout.write('junk\n')
else if (mode === 'wrong-id') process.stdout.write(response().replace(request.request_id, 'wrong-id'))
else if (mode === 'invalid-utf8') process.stdout.write(Buffer.from([0xff, 0x0a]))
else if (mode === 'nonzero-ok') { process.stdout.write(response()); process.exitCode = 7 }
else if (mode === 'too-large') process.stdout.write('x'.repeat(1024 * 1024 + 2))
else if (mode === 'business') process.stdout.write(response(false))
else if (mode === 'commit-no-ack') {
  writeFileSync(marker, 'committed')
  process.exitCode = 9
} else if (mode === 'noise') process.stdout.write(response() + 'noise\n')
else if (mode === 'duplicate') process.stdout.write(response().replace('"ok":true', '"ok":false,"ok":true'))
else if (mode === 'nested-duplicate') process.stdout.write(response().replace('"echo":', '"echo":null,"\\u0065cho":'))
else process.stdout.write(response())
