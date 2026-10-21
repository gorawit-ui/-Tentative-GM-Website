// A11 — the QR image of an area, drawn in the page from a free MIT encoder in the bundle: no QR web
// service and no monthly QR product (Part 6 §6.2). Error correction M keeps the short link a small,
// easy-to-scan code; the image is an SVG path of 1×1 modules inside a 4-module quiet zone.
import qrcode from 'qrcode-generator';

/** The blank border every QR code needs around it (ISO/IEC 18004: 4 modules). */
export const QR_QUIET_ZONE = 4;

/** Rows of modules, `true` = dark. */
export function qrMatrix(text: string): boolean[][] {
  const code = qrcode(0, 'M');
  code.addData(text, 'Byte');
  code.make();
  const size = code.getModuleCount();
  return Array.from({ length: size }, (_row, y) => Array.from({ length: size }, (_column, x) => code.isDark(y, x)));
}

/** One `M x y h1v1h-1z` square per dark module, already offset by the quiet zone. */
export function qrSvgPath(matrix: readonly (readonly boolean[])[]): string {
  const squares: string[] = [];
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) squares.push(`M${x + QR_QUIET_ZONE} ${y + QR_QUIET_ZONE}h1v1h-1z`);
    }),
  );
  return squares.join(' ');
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The whole picture, viewBox in modules: what “ดาวน์โหลด SVG” saves. A `watermark` (a sample before the
 * production domain) is drawn across the code, so a downloaded sample cannot pass for the real one.
 */
export function qrSvgDocument(text: string, title: string, watermark?: string): string {
  const matrix = qrMatrix(text);
  const size = matrix.length + 2 * QR_QUIET_ZONE;
  const mark =
    watermark === undefined
      ? ''
      : `<text x="${size / 2}" y="${size / 2}" transform="rotate(-30 ${size / 2} ${size / 2})" text-anchor="middle" dominant-baseline="middle" font-size="${(size / 12).toFixed(2)}" font-weight="700" fill="#b42318" fill-opacity="0.85" stroke="#fff" stroke-width="${(size / 120).toFixed(2)}" paint-order="stroke">${escapeXml(watermark)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><title>${escapeXml(title)}</title><rect width="${size}" height="${size}" fill="#fff"/><path d="${qrSvgPath(matrix)}" fill="#000"/>${mark}</svg>`;
}
