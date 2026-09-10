# Native visual references

Open `index.html` to inspect the current native captures. PNG filenames identify
the scenario and viewport; `manifest.json` records platform and source provenance.
These references are stored in Git for visual review, without pixel comparisons.

Run `pnpm verify:ci build` when application inputs change, then
`pnpm visual:capture` (or append a spec path / `--grep`). Partial runs update only
their scenarios. CI Linux captures are stored as Actions artifacts and never
update this directory. Do not hand-edit generated PNGs, HTML or the manifest.
