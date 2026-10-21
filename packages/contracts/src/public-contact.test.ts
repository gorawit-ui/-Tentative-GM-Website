// D-A09-4 — a pre-login contact may carry a link (LINE OA, a LINE group, a phone): only `https:` and
// `tel:` ever become a link; anything else (`javascript:`, `data:`, `http:`, app schemes …) is dropped.
import { describe, expect, it } from 'vitest';
import { MAX_CONTACT_URL_CHARS, contactUrlHref, telHref } from './public-contact';

describe('contactUrlHref', () => {
  it.each([
    ['https://line.me/R/ti/p/@gm-example', 'https://line.me/R/ti/p/@gm-example'],
    ['  https://example.com/gm?x=1#top  ', 'https://example.com/gm?x=1#top'],
    ['HTTPS://Example.com/GM', 'https://example.com/GM'],
    ['https://example.com', 'https://example.com/'],
    ['https://example.com:8443/gm', 'https://example.com:8443/gm'],
    ['tel:02-000-0000', 'tel:020000000'],
    ['tel:+66 2 000 0000', 'tel:+6620000000'],
  ])('%j → %j', (stored, href) => {
    expect(contactUrlHref(stored)).toBe(href);
  });

  it.each([
    'http://example.com/gm',
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<b>x</b>',
    'mailto:gm@tdfb.co',
    'line://ti/p/@gm-example',
    'ftp://example.com',
    '//example.com/gm',
    'example.com/gm',
    'https://',
    'https://user:secret@example.com/gm',
    'https://example.com@evil.example/gm',
    'https://example.com\\@evil.example/gm',
    'https://localhost/gm',
    'https://example.com/"onmouseover=x',
    'https://exa mple.com/gm',
    'https://example.com/\ngm',
    'tel:',
    'tel:โทร',
    'tel:02-000-0000;ext=12',
    `https://example.com/${'a'.repeat(MAX_CONTACT_URL_CHARS)}`,
    '',
    '   ',
  ])('not a link: %j', (stored) => {
    expect(contactUrlHref(stored)).toBeUndefined();
  });

  it.each([undefined, null, 42, {}, ['https://example.com']])('not text → not a link (%o)', (stored) => {
    expect(contactUrlHref(stored)).toBeUndefined();
  });

  it('a phone link is the same as telHref of the number', () => {
    expect(contactUrlHref('tel:02-000-0000')).toBe(telHref('02-000-0000'));
  });
});
