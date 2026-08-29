import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicTokenFamilies } from '../tokens.js';
import { publicComponentCoverage, publicStateCoverage } from '../coverage.js';
import * as ui from '../index.js';

describe('design token contract', () => {
  it('registers every required public token family', () => {
    expect(Object.keys(publicTokenFamilies)).toEqual(
      expect.arrayContaining([
        'colors',
        'semanticColors',
        'typography',
        'spacing',
        'radius',
        'elevation',
        'duration',
        'easing',
        'springs',
        'transforms',
        'opacity',
        'choreography',
        'density',
        'layers',
        'breakpoints',
        'focus',
        'charts',
      ]),
    );
  });

  it('does not embed reusable visual constants in component source', () => {
    const sourceDir = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = [
      'primitives.tsx',
      'forms.tsx',
      'navigation.tsx',
      'feedback.tsx',
      'overlays.tsx',
      'data.tsx',
      'sections.tsx',
      'shells.tsx',
    ];
    const source = files.map((file) => readFileSync(join(sourceDir, file), 'utf8')).join('\n');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/zIndex\s*:\s*\d+/);
    expect(source).not.toMatch(/boxShadow\s*:\s*['"]/);
    expect(source).not.toMatch(/duration\s*:\s*(?!durationTokens)[1-9]\d*/);
  });

  it('registers every public component and required state', () => {
    const componentNames = Object.values(publicComponentCoverage).flat();
    expect(new Set(componentNames).size).toBe(componentNames.length);
    for (const name of componentNames) expect(ui).toHaveProperty(name);
    expect(Object.values(publicStateCoverage).flat()).toEqual(
      expect.arrayContaining([
        'pressed',
        'focus-visible',
        'invalid',
        'focus-return',
        'permission',
        'reduced-motion',
      ]),
    );
  });
});
