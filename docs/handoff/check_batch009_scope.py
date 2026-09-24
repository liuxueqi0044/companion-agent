"""Read-only BATCH-009 scope check. Does not approve work or run application tests."""
from pathlib import Path
import os,json,hashlib,sys
R=Path(__file__).resolve().parents[2]
BASE='docs/handoff/BATCH-009-BASELINE.json'
PRUNE={'.git','node_modules','.venv','.venv-repro','.local-tools','.uv-cache','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','dist','build','coverage'}
EXACT={'docs/evidence/ui-preview.md', 'tests/spikes/input-workbench/parse-csv.ts', 'docs/evidence/codex-connection.json', 'tests/spikes/ui-preview-env.d.ts', 'tests/spikes/deepseek_client.ts', 'reports/M00.5.01.json', 'docs/evidence/codex-live-runbook.md', 'reports/evidence/M00.4.02/artifact-manifest.json', 'tests/spikes/package.json', 'reports/M00.5.01.checkpoint.md', 'tests/spikes/deepseek_smoke.ts', 'reports/BATCH-009.md', 'docs/evidence/deepseek-smoke.md', 'tests/spikes/input-workbench/model.ts', 'reports/evidence/M00.5.01/artifact-manifest.json', 'tests/spikes/tsconfig.ui-preview.json', 'tests/spikes/input-workbench/InputWorkbench.vue', 'tests/spikes/ui-preview.ts', 'tests/spikes/package-lock.json', 'tests/spikes/input-workbench/SourceDialog.vue', 'tests/spikes/ui-preview.vue', 'tests/spikes/codex_protocol.ts', 'reports/BATCH-009-DEEPSEEK.json', 'reports/M00.4.02.checkpoint.md', 'tests/spikes/ui-preview.css', 'tests/spikes/input-workbench/draft-io.ts', 'reports/M00.4.02.json', 'tests/spikes/input-workbench/workbench.css', 'tests/spikes/input-workbench/draft.ts', 'tests/spikes/codex_connection.ts'}
PREFIXES=('reports/evidence/M00.5.01/BATCH-009/', 'reports/evidence/M00.4.02/BATCH-009/', 'reports/evidence/BATCH-009-DEEPSEEK/')
def allowed(p):return p in EXACT or p.startswith(PREFIXES)

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def files():
 result={}
 for directory,dirs,names in os.walk(R,followlinks=False):
  dirs[:]=sorted(d for d in dirs if d not in PRUNE)
  for name in sorted(names):
   p=Path(directory)/name;rel=p.relative_to(R).as_posix()
   if rel==BASE or name.endswith(('.pyc','.pyo')):continue
   result[rel]=sha(p)
 return result
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8')
 b=json.loads((R/BASE).read_text(encoding='utf-8'))
 expected='sha256:'+hashlib.sha256(json.dumps(b['files'],ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
 if expected!=b['snapshot_id']:raise SystemExit('FAIL: baseline digest mismatch')
 before={x['path']:x['sha256'] for x in b['files']};now=files()
 groups={'modified':sorted(p for p in before if p in now and now[p]!=before[p]),'added':sorted(set(now)-set(before)),'missing':sorted(set(before)-set(now))}
 outside=[p for v in groups.values() for p in v if not allowed(p)]
 ok=not outside and not groups['missing']
 print(json.dumps({'batch_id':'BATCH-009','snapshot_id':b['snapshot_id'],'counts':{k:len(v) for k,v in groups.items()},'changes':groups,'outside':outside,'result':'PASS' if ok else 'FAIL','note':'Generated dependency/cache/build directories excluded; this checks scope only, not their contents or authorship.'},ensure_ascii=False,indent=2))
 raise SystemExit(0 if ok else 1)
