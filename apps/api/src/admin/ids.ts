// A11 — default IDs of new Admin documents. A QR code ID is printed on the wall, so it carries nothing
// but 128 random bits (base64url, 22 characters): not the area, not the time (Part 6 §6.2).
import { randomBytes } from 'node:crypto';

export const randomQrId = (): string => randomBytes(16).toString('base64url');
export const randomAreaId = (): string => randomBytes(6).toString('hex');
