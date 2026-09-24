"""Read-only BATCH-016 scope check. Does not approve work or run application tests."""
from pathlib import Path
import os,json,hashlib,sys
R=Path(__file__).resolve().parents[2]
BASE='docs/handoff/BATCH-016-BASELINE.json'
PRUNE={'.git','node_modules','.venv','.venv-repro','.local-tools','.uv-cache','__pycache__','.pytest_cache','.mypy_cache','.ruff_cache','dist','coverage'}
EXACT={'tools/desktop_bridge.py','reports/BATCH-016.json','reports/BATCH-016.md','reports/BATCH-016.checkpoint.md'}
def allowed(p):return p in EXACT or p.startswith(('services/desktop_bridge/','apps/desktop/bridge/','packages/contracts/desktop-local/','tests/unit/desktop_bridge/','tests/integration/desktop_bridge/','reports/evidence/BATCH-016/'))

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
 print(json.dumps({'batch_id':'BATCH-016','snapshot_id':b['snapshot_id'],'counts':{k:len(v) for k,v in groups.items()},'changes':groups,'outside':outside,'result':'PASS' if ok else 'FAIL','note':'Dependency/cache/dist directories excluded; build directories included, including authoring/build source. Scope only, not functional acceptance.'},ensure_ascii=False,indent=2))
 raise SystemExit(0 if ok else 1)
