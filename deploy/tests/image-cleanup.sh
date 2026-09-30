#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_BASE="$(mktemp -d /tmp/care-deployment-test-images-XXXXXX)"
trap 'rm -rf -- "${TEST_BASE}"' EXIT
mkdir -p "${TEST_BASE}/bin" "${TEST_BASE}/shared/deployment-state" "${TEST_BASE}/current"
printf 'COMPOSE_PROJECT_NAME=care-staging\n' >"${TEST_BASE}/current/.runtime.env"
export IMAGE_TEST_STATE="${TEST_BASE}/docker.json"
cat >"${TEST_BASE}/bin/docker" <<'PY'
#!/usr/bin/env python3
import json, os, sys
from pathlib import Path
p = Path(os.environ['IMAGE_TEST_STATE'])
s = json.loads(p.read_text())
a = sys.argv[1:]
s['calls'].append(a)
p.write_text(json.dumps(s))
def save():
    p.write_text(json.dumps(s))
def referenced(id):
    return any(c['image'] == id for c in s['containers'].values())
if a[:2] == ['image', 'ls']:
    for id, i in s['images'].items():
        for tag in i['tags']:
            print(tag.split(':')[0], id)
elif a[0] == 'ps':
    scoped = '--filter' in a
    for id, c in s['containers'].items():
        if not scoped or (c['project'] == 'care-staging' and c['status'] in ['exited', 'dead', 'created']):
            print(id)
elif a[0] == 'inspect':
    print(s['containers'][a[-1]]['image'])
elif a[:2] == ['container', 'rm']:
    del s['containers'][a[-1]]
    save()
elif a[:2] == ['image', 'inspect']:
    i = s['images'].get(a[-1])
    if i is None: sys.exit(1)
    if '--format' in a: print('\n'.join(i['tags']))
    else: print(json.dumps(i))
elif a[:2] == ['image', 'rm']:
    target = a[-1]
    id = target if target in s['images'] else next((id for id, i in s['images'].items() if target in i['tags']), None)
    if id is None or referenced(id): sys.exit(1)
    i = s['images'][id]
    if target in i['tags']: i['tags'].remove(target)
    if not i['tags']: del s['images'][id]
    save()
elif a[:2] == ['image', 'prune']:
    assert a == ['image', 'prune', '--force', '--filter', 'label=com.satucare.application=care']
    for id, i in list(s['images'].items()):
        if i['label'] and not i['tags'] and not referenced(id): del s['images'][id]
    save()
elif a == ['system', 'df']:
    print('Disk usage reported')
else:
    raise Exception('Unexpected Docker command: ' + str(a))
PY
chmod +x "${TEST_BASE}/bin/docker"
export PATH="${TEST_BASE}/bin:${PATH}"
python3 - <<'PY'
import json, os
from pathlib import Path
ids = ['sha256:' + str(i) * 64 for i in range(1, 9)]
# Untagged legacy postgres ID is captured before its mutable tag is overwritten.
images = {
 ids[0]: {'tags': ['care-api:active'], 'label': True},
 ids[1]: {'tags': ['care-api:retained-previous'], 'label': False},
 ids[2]: {'tags': ['care-postgres:16-pgvector'], 'label': False},
 ids[3]: {'tags': ['care-web-voice:old', 'other-app:shared'], 'label': False},
 ids[4]: {'tags': ['other-app:unused'], 'label': False},
 ids[5]: {'tags': [], 'label': True},
 ids[6]: {'tags': [], 'label': False},
 ids[7]: {'tags': ['care-web-admin:other-environment'], 'label': True},
}
containers = {
 'active': {'image': ids[0], 'project': 'care-staging', 'status': 'running'},
 'old-job': {'image': ids[1], 'project': 'care-staging', 'status': 'exited'},
 'foreign-stopped': {'image': ids[7], 'project': 'other-app', 'status': 'exited'},
}
Path(os.environ['IMAGE_TEST_STATE']).write_text(json.dumps({'images': images, 'containers': containers, 'calls': []}))
PY
"${ROOT}/deploy/scripts/cleanup-images.sh" inventory "${TEST_BASE}"
python3 - <<'PY'
import json, os
from pathlib import Path
p = Path(os.environ['IMAGE_TEST_STATE']); s = json.loads(p.read_text())
assert not any(a[:2] in [['image', 'rm'], ['image', 'prune'], ['container', 'rm']] for a in s['calls'])
s['images']['sha256:' + '3' * 64]['tags'] = []
p.write_text(json.dumps(s))
PY
"${ROOT}/deploy/scripts/cleanup-images.sh" clean "${TEST_BASE}" >/dev/null
"${ROOT}/deploy/scripts/cleanup-images.sh" clean "${TEST_BASE}" >/dev/null
python3 - <<'PY'
import json, os
from pathlib import Path
s = json.loads(Path(os.environ['IMAGE_TEST_STATE']).read_text())
assert set(s['images']) == {'sha256:' + str(i) * 64 for i in [1, 4, 5, 7, 8]}, s['images']
assert set(s['containers']) == {'active', 'foreign-stopped'}, s['containers']
assert not any('--force' in a or '-f' in a for a in s['calls'] if a[:2] == ['image', 'rm'])
assert not any(a[:2] in [['volume', 'prune'], ['system', 'prune'], ['builder', 'prune']] for a in s['calls'])
PY
echo 'CARE image ownership, legacy mutable tag, retained release, active/shared image, stopped container, dangling image and idempotency tests passed.'
