// S12 / D-S10-3 — attachment limits shared by the API and the web client: image types only, a size
// cap per photo (provisional, Q-S12-1), PUT links 15 minutes, GET links 5 minutes.
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_CONTENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  UPLOAD_URL_TTL_SECONDS,
  VIEW_URL_TTL_SECONDS,
  attachmentObjectPath,
  imageTypeFromBytes,
  parseAttachmentObjectPath,
} from './index';

describe('attachment limits (D-S10-3, Part 6 §6.10)', () => {
  it('upload links live 15 minutes, view links 5 minutes', () => {
    expect(UPLOAD_URL_TTL_SECONDS).toBe(15 * 60);
    expect(VIEW_URL_TTL_SECONDS).toBe(5 * 60);
  });

  it('images only: JPEG, PNG, WebP; no SVG (it can carry script)', () => {
    expect(ATTACHMENT_CONTENT_TYPES).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(ATTACHMENT_CONTENT_TYPES).not.toContain('image/svg+xml');
  });

  it('a photo after client resizing (avg 0.5 MiB) fits well under the cap', () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe('attachment object paths', () => {
  it('builds and reads back requests/{id}/attachments/{attachment}', () => {
    expect(attachmentObjectPath('req-1', 'att-1')).toBe('requests/req-1/attachments/att-1');
    expect(parseAttachmentObjectPath('requests/req-1/attachments/att-1')).toEqual({ requestId: 'req-1', attachmentId: 'att-1' });
  });

  it.each([
    'requests/req-1/attachments/../../req-2/attachments/att-1',
    'requests/req-1/attachments/..',
    'requests/../req-2/attachments/att-1',
    'requests/req-1/attachments/att-1/../x',
    '/requests/req-1/attachments/att-1',
    'requests/req-1/attachments/att-1/',
    'requests//attachments/att-1',
    'pending/up-1',
    'contributions/req-1/up-1',
    'requests/req-1/attachments/att%2F..',
    'requests/req-1/attachments/att 1',
  ])('refuses %j', (path) => {
    expect(parseAttachmentObjectPath(path)).toBeUndefined();
  });
});

const ascii = (text: string) => Uint8Array.from([...text].map((char) => char.charCodeAt(0)));

describe('imageTypeFromBytes — the stored bytes must really start like an image', () => {
  it('recognises JPEG, PNG and WebP signatures', () => {
    expect(imageTypeFromBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg');
    expect(imageTypeFromBytes(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(imageTypeFromBytes(ascii('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
  });

  it('anything else is not an image', () => {
    expect(imageTypeFromBytes(ascii('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeUndefined();
    expect(imageTypeFromBytes(ascii('%PDF-1.7'))).toBeUndefined();
    expect(imageTypeFromBytes(new Uint8Array())).toBeUndefined();
  });
});
