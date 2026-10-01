# Buildx du emits one JSON object per record. CARE package execution uniquely
# seeds ownership; descendants inherit it. Generic ancestors/context/base layers
# are not promoted to ownership. Shared or non-reclaimable records stay protected.
def care_command:
  test("^mount / from exec /bin/sh -c pnpm (install --frozen-lockfile --filter|--filter) @care/(api|contracts|web-voice|web-admin)([^a-zA-Z0-9_-]|$)");
def expand($records):
  . as $owned |
  ($owned + [$records[] | select(any(.Parents[]?; . as $parent | $owned | index($parent))) | .ID]) | unique;
. as $records |
([$records[] | select((.Description // "") | care_command) | .ID] | unique |
 until(. == expand($records); expand($records))) as $owned |
$records[] |
select(.ID as $id | $owned | index($id)) |
select(.Shared == false and .Reclaimable == true) |
.ID
