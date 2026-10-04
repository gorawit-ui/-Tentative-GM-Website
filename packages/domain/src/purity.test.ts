// @gm/domain must stay pure (CLAUDE.md): no wall clock, Firebase, network or environment.
// tsconfig.json also gives src no Node or DOM globals.
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const srcDir = new URL('./', import.meta.url);
const sources = readdirSync(srcDir)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: readFileSync(new URL(name, srcDir), 'utf8') }));

describe('@gm/domain source purity', () => {
  it('has source files to check', () => {
    expect(sources.map((source) => source.name)).toContain('request-creation.ts');
  });

  it.each([
    ['Date.now()', /\bDate\.now\s*\(/],
    ['new Date() without arguments', /\bnew\s+Date\s*\(\s*\)/],
    ['process', /\bprocess\./],
    ['fetch', /\bfetch\s*\(/],
    ['firebase', /firebase/i],
  ])('no source file uses %s', (_label, pattern) => {
    expect(sources.filter((source) => pattern.test(source.text)).map((source) => source.name)).toEqual([]);
  });

  it('imports only its own modules or @gm/time', () => {
    const imports = sources.flatMap((source) =>
      [...source.text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((match) => match[1] ?? ''),
    );
    expect(imports.filter((specifier) => !specifier.startsWith('./') && specifier !== '@gm/time')).toEqual([]);
  });
});
