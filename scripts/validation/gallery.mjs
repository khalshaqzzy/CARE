import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createHash } from 'node:crypto';

export const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export async function writeGallery(directory, manifest) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const cards = manifest.scenarios
    .map(
      (scenario) =>
        `<section><h2>${escapeHtml(scenario.title)}</h2><p>${escapeHtml(scenario.status)}</p>${scenario.images.map((image) => `<figure><a href="${escapeHtml(image.file)}"><img loading="lazy" src="${escapeHtml(image.file)}" alt="${escapeHtml(image.name)}"></a><figcaption>${escapeHtml(image.name)}</figcaption></figure>`).join('')}</section>`,
    )
    .join('');
  await writeFile(
    join(directory, 'index.html'),
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CARE visual inspection</title><style>body{font:16px system-ui;margin:24px;background:#f4f7fc;color:#17243b}header,section{background:white;padding:24px;margin:16px 0;border:1px solid #dae2ef;border-radius:16px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:16px}h2{font-size:18px}figure{margin:16px 0}img{max-width:100%;max-height:600px;object-fit:contain;object-position:top}figcaption,p{overflow-wrap:anywhere}</style><header><h1>CARE visual inspection</h1><p>Source ${escapeHtml(manifest.sha)} · ${escapeHtml(manifest.platform)} · ${manifest.scenarios.length} scenarios</p><p>Captured evidence; no pixel comparison. Downloaded gallery can be opened offline.</p></header><main>${cards}</main></html>`,
  );
}

export async function copyCapture(source, directory, identity, readableName) {
  const bytes = await readFile(source);
  if (
    bytes.length < 24 ||
    bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    !bytes.readUInt32BE(16) ||
    !bytes.readUInt32BE(20)
  )
    throw new Error(`Invalid capture: ${source}`);
  if (readableName && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.png$/.test(readableName))
    throw new Error(`Unsafe capture name: ${readableName}`);
  const file = readableName ?? createHash('sha256').update(identity).digest('hex') + '.png';
  await mkdir(directory, { recursive: true });
  await copyFile(source, join(directory, file));
  return {
    file,
    name: basename(source),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

export async function mergeGalleries(inputs, output, expected) {
  const scenarios = [];
  let first;
  for (const input of inputs) {
    const manifest = JSON.parse(await readFile(join(input, 'manifest.json'), 'utf8'));
    first ??= manifest;
    if (manifest.sha !== first.sha) throw new Error('Gallery source SHA mismatch');
    for (const scenario of manifest.scenarios) {
      if (scenarios.some((item) => item.id === scenario.id))
        throw new Error(`Duplicate scenario: ${scenario.id}`);
      const images = [];
      for (const image of scenario.images) {
        if (basename(image.file) !== image.file) throw new Error('Unsafe gallery path');
        images.push({
          ...(await copyCapture(join(input, image.file), output, `${scenario.id}:${image.file}`)),
          name: image.name,
        });
      }
      if (scenario.status !== 'passed' || !images.length)
        throw new Error(`Incomplete scenario: ${scenario.title}`);
      scenarios.push({ ...scenario, images });
    }
  }
  if (!first || !scenarios.length || (expected !== undefined && scenarios.length !== expected))
    throw new Error(`Capture coverage mismatch: ${scenarios.length}, expected ${expected}`);
  await writeGallery(output, { ...first, scenarios });
}

/** Persist native inspection references; partial captures replace only their scenarios. */
export async function persistLocalGallery(input, output, complete = false) {
  const current = JSON.parse(await readFile(join(input, 'manifest.json'), 'utf8'));
  if (
    !current.scenarios.length ||
    current.scenarios.some((scenario) => scenario.status !== 'passed' || !scenario.images.length)
  )
    throw new Error('Only successful native captures can update repository references');
  let previous = { scenarios: [] };
  try {
    previous = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const selected = new Set(current.scenarios.map((scenario) => scenario.id));
  const names = new Set(
    (complete ? [] : previous.scenarios.filter((scenario) => !selected.has(scenario.id))).flatMap(
      (scenario) => scenario.images.map((image) => image.file.toLowerCase()),
    ),
  );
  for (const scenario of current.scenarios)
    for (const image of scenario.images) {
      if (!image.name || names.has(image.name.toLowerCase()))
        throw new Error(`Duplicate or missing native capture name: ${image.name}`);
      names.add(image.name.toLowerCase());
    }
  const updated = [];
  for (const scenario of current.scenarios) {
    const images = [];
    for (const image of scenario.images) {
      if (basename(image.file) !== image.file) throw new Error('Unsafe capture path');
      images.push({
        ...(await copyCapture(
          join(input, image.file),
          output,
          `${scenario.id}:${image.name}`,
          image.name,
        )),
        name: image.name,
      });
    }
    updated.push({ ...scenario, sha: current.sha, platform: current.platform, images });
  }
  const replaced = new Set(updated.map((scenario) => scenario.id));
  const scenarios = [
    ...(complete ? [] : previous.scenarios.filter((scenario) => !replaced.has(scenario.id))),
    ...updated,
  ].sort((a, b) => a.title.localeCompare(b.title));
  await writeGallery(output, { ...current, scenarios });
  const retained = new Set(
    scenarios.flatMap((scenario) => scenario.images.map((image) => image.file)),
  );
  const { unlink } = await import('node:fs/promises');
  for (const image of previous.scenarios.flatMap((scenario) => scenario.images)) {
    if (basename(image.file) !== image.file) throw new Error('Unsafe previous capture path');
    if (!retained.has(image.file)) {
      try {
        await unlink(join(output, image.file));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
}
