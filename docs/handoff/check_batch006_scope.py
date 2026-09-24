"""Read-only BATCH-006 scope check. Does not approve work or run application tests."""
from pathlib import Path
import os,json,hashlib,sys
R=Path(__file__).resolve().parents[2]
BASE='docs/handoff/BATCH-006-BASELINE.json'
PRUNE={'.git','node_modules','.venv','.venv-repro','.local-tools','.uv-cache','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','dist','build','coverage'}
EXACT={'tests/spikes/hermes_eventlog.py','tests/spikes/hermes_observer.py','docs/evidence/hermes-lifecycle.json','docs/evidence/airi-extraction.md','reports/evidence/M00.3.01/artifact-manifest.json','reports/BATCH-006.md'}
IDS=('M00.3.01','M00.4.01')
for tid in IDS: EXACT.update({f'reports/{tid}.json',f'reports/{tid}.checkpoint.md'})
def allowed(p):
 return p in EXACT or any(p.startswith(prefix) for prefix in ('reports/evidence/M00.3.01/offline/','reports/evidence/M00.3.01/tmp/','reports/evidence/M00.3.01/logs/B6-','reports/evidence/M00.4.01/'))

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
 print(json.dumps({'batch_id':'BATCH-006','snapshot_id':b['snapshot_id'],'counts':{k:len(v) for k,v in groups.items()},'changes':groups,'outside':outside,'result':'PASS' if ok else 'FAIL','note':'Generated dependency/cache/build directories excluded; this checks scope only, not their contents or authorship.'},ensure_ascii=False,indent=2))
 raise SystemExit(0 if ok else 1)
