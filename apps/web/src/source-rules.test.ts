// A09 — rules for the web source that a type checker cannot see:
// - FU-36 / D-A07-2: dates and times on screen come from `formatThaiDateTime` (@gm/time), the same
//   function as the notifications; the web never formats dates itself.
// - P1 / CLAUDE.md: every CSS rule sits in a cascade layer; the tokens are imported `layer(components)`;
//   the app's token files are the reference files unchanged (generated from tokens.json).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const webRoot = new URL('..', import.meta.url).pathname;
const srcDir = join(webRoot, 'src');
const referenceDir = new URL('../../../reference/gm-design-tokens/', import.meta.url).pathname;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const sources = filesUnder(srcDir).filter((path) => /\.(ts|tsx)$/.test(path) && !/\.test\.tsx?$/.test(path));
const styles = filesUnder(srcDir).filter((path) => path.endsWith('.css'));

describe('dates on screen (FU-36)', () => {
  it('has web sources to check', () => {
    expect(sources.length).toBeGreaterThan(5);
  });

  it.each([
    ['toLocaleString / toLocaleDateString / toLocaleTimeString', /\.toLocale(Date|Time)?String\s*\(/],
    ['Intl.DateTimeFormat', /Intl\s*\.\s*DateTimeFormat/],
    ['Date#getFullYear/getMonth/getDate/getHours (hand-made formatting)', /\.get(UTC)?(FullYear|Month|Date|Day|Hours|Minutes)\s*\(/],
  ])('no source uses %s', (_label, pattern) => {
    expect(sources.filter((path) => pattern.test(readFileSync(path, 'utf8'))).map((path) => relative(webRoot, path))).toEqual([]);
  });

  it('formatThaiDateTime is what the screens use', () => {
    expect(sources.some((path) => /formatThaiDateTime\s*\(/.test(readFileSync(path, 'utf8')))).toBe(true);
  });
});

/** The CSS outside comments, at nesting depth 0, that is not an @import/@config/@layer/@property. */
function unlayeredTopLevel(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: string[] = [];
  let depth = 0;
  let statement = '';
  for (const char of text) {
    if (depth === 0) statement += char;
    if (char === '{') {
      if (depth === 0) {
        const head = statement.slice(0, -1).trim();
        if (!/^@(layer|property)\b/.test(head)) found.push(head);
        statement = '';
      }
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
    } else if (char === ';' && depth === 0) {
      const head = statement.trim();
      if (!/^@(import|config|layer)\b/.test(head)) found.push(head);
      else if (head.startsWith('@import') && !/^@import\s+"tailwindcss"/.test(head) && !/\blayer\(\w+\)\s*;$/.test(head)) found.push(head);
      statement = '';
    }
  }
  return found;
}

describe('CSS cascade layers (P1)', () => {
  it('the entry is P1: tailwindcss, tokens in layer(components), the shared config', () => {
    const entry = readFileSync(join(srcDir, 'styles/app.css'), 'utf8');
    const lines = entry.split('\n').filter((line) => line.startsWith('@'));
    expect(lines.slice(0, 3)).toEqual(['@import "tailwindcss";', '@import "./tokens.css" layer(components);', '@config "./tailwind.config.cjs";']);
  });

  /** Files the entry imports into a layer as a whole (`@import "./x.css" layer(name)`): their own text is flat. */
  const layeredImports = [...readFileSync(join(srcDir, 'styles/app.css'), 'utf8').matchAll(/@import\s+"\.\/([^"]+)"\s+layer\((\w+)\)\s*;/g)].map((match) => join(srcDir, 'styles', match[1] ?? ''));

  it('tokens.css and the shell styles are imported into the components layer', () => {
    expect(layeredImports.map((path) => relative(srcDir, path))).toEqual(['styles/tokens.css', 'styles/shell.css']);
  });

  it.each(styles.map((path) => [relative(webRoot, path), path]))('%s has no rule outside a layer', (_name, path) => {
    if (layeredImports.includes(path)) return;
    expect(unlayeredTopLevel(readFileSync(path, 'utf8'))).toEqual([]);
  });

  it('a layered import file does not open its own layers (it would nest under components)', () => {
    for (const path of layeredImports) expect(readFileSync(path, 'utf8')).not.toMatch(/@layer\b/);
  });

  it('the checker sees an unlayered rule and an @import without layer()', () => {
    expect(unlayeredTopLevel('@layer components { .a { color: red; } }\n.b { color: blue; }')).toEqual(['.b']);
    expect(unlayeredTopLevel('@import "./x.css";')).toEqual(['@import "./x.css";']);
    expect(unlayeredTopLevel('@import "./x.css" layer(base);\n@media (min-width: 1px) { .c { color: red; } }')).toEqual(['@media (min-width: 1px)']);
  });

  it.each(['tokens.css', 'tokens.json', 'tailwind.config.cjs'])('%s is the reference file unchanged', (name) => {
    expect(readFileSync(join(srcDir, 'styles', name), 'utf8')).toBe(readFileSync(join(referenceDir, name), 'utf8'));
  });
});
