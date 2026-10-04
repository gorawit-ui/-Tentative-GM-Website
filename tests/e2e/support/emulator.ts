// Firestore emulator REST helpers for E2E seeding. `Bearer owner` is the emulator's own admin
// bypass token; it has no meaning outside the local emulator.
import { readFileSync } from 'node:fs';

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

export type FixtureData = Record<string, unknown>;
export interface Fixtures {
  readonly collections: Record<string, Record<string, FixtureData>>;
}

export interface EmulatorTarget {
  readonly host: string;
  readonly project: string;
}

const OWNER = { Authorization: 'Bearer owner' };

export function emulatorTarget(): EmulatorTarget {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const project = process.env.GCLOUD_PROJECT ?? '';
  if (!host || !project.startsWith('demo-')) {
    throw new Error('Run E2E with `npm run test:e2e` (Firebase emulators on a demo-* project).');
  }
  return { host, project };
}

export function loadFixtures(): Fixtures {
  return JSON.parse(readFileSync(new URL('../fixtures/th-fixtures.json', import.meta.url), 'utf8')) as Fixtures;
}

function toValue(value: unknown): FirestoreValue {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') return { mapValue: { fields: toFields(value as FixtureData) } };
  throw new Error(`Unsupported fixture value: ${typeof value}`);
}

function toFields(data: FixtureData): Record<string, FirestoreValue> {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, toValue(value)]));
}

function fromValue(value: FirestoreValue): unknown {
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromValue);
  return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, fromValue(item)]));
}

function documentUrl({ host, project }: EmulatorTarget, collection: string, id: string): string {
  return `http://${host}/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
}

async function expectOk(response: Response, action: string): Promise<Response> {
  if (!response.ok) throw new Error(`${action} failed: ${response.status} ${await response.text()}`);
  return response;
}

export async function clearFirestore({ host, project }: EmulatorTarget): Promise<void> {
  const url = `http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`;
  await expectOk(await fetch(url, { method: 'DELETE' }), 'clear Firestore emulator');
}

export async function writeDocument(target: EmulatorTarget, collection: string, id: string, data: FixtureData) {
  const response = await fetch(documentUrl(target, collection, id), {
    method: 'PATCH',
    headers: { ...OWNER, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  await expectOk(response, `seed ${collection}/${id}`);
}

export async function readDocument(target: EmulatorTarget, collection: string, id: string): Promise<FixtureData> {
  const response = await expectOk(await fetch(documentUrl(target, collection, id), { headers: OWNER }), `read ${collection}/${id}`);
  const document = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return fromValue({ mapValue: { fields: document.fields ?? {} } }) as FixtureData;
}
