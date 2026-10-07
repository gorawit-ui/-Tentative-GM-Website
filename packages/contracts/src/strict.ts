// Strict reading of untrusted JSON at the API boundary (S08, Part 6 §6.3): every object lists its
// fields, anything else is refused, and the result is a fresh object built from known fields only.

export type ContractCode =
  | 'BODY_INVALID'
  | 'COMMAND_ID_INVALID'
  | 'COMMAND_TYPE_UNKNOWN'
  | 'UNKNOWN_FIELD'
  | 'FIELD_REQUIRED'
  | 'FIELD_TYPE'
  | 'FIELD_INVALID';

/** A body that does not match its contract; `path` names the field (e.g. `payload.category`). */
export class ContractRejected extends Error {
  readonly code: ContractCode;
  readonly path: string;
  constructor(code: ContractCode, path: string, message: string) {
    super(message);
    this.name = 'ContractRejected';
    this.code = code;
    this.path = path;
  }
}

export type JsonObject = Readonly<Record<string, unknown>>;

export const join = (path: string, key: string) => (path === '' ? key : `${path}.${key}`);

export function isPlainObject(value: unknown): value is JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The object at `path`, after refusing any own key outside `allowed`. */
export function strictObject(value: unknown, path: string, allowed: readonly string[]): JsonObject {
  if (!isPlainObject(value)) throw new ContractRejected('FIELD_TYPE', path, `${path || 'body'} must be an object`);
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown !== undefined) throw new ContractRejected('UNKNOWN_FIELD', join(path, unknown), `unknown field ${join(path, unknown)}`);
  return value;
}

function present(object: JsonObject, key: string): boolean {
  return Object.hasOwn(object, key) && object[key] !== undefined;
}

export function requiredField(object: JsonObject, path: string, key: string): unknown {
  if (!present(object, key)) throw new ContractRejected('FIELD_REQUIRED', join(path, key), `${join(path, key)} is required`);
  return object[key];
}

export function stringField(object: JsonObject, path: string, key: string): string {
  const value = requiredField(object, path, key);
  if (typeof value !== 'string') throw new ContractRejected('FIELD_TYPE', join(path, key), `${join(path, key)} must be a string`);
  return value;
}

export function optionalString(object: JsonObject, path: string, key: string): string | undefined {
  return present(object, key) ? stringField(object, path, key) : undefined;
}

export function optionalBoolean(object: JsonObject, path: string, key: string): boolean | undefined {
  if (!present(object, key)) return undefined;
  const value = object[key];
  if (typeof value !== 'boolean') throw new ContractRejected('FIELD_TYPE', join(path, key), `${join(path, key)} must be true or false`);
  return value;
}

/** `{ [key]: value }`, or `{}` when absent, so optional fields are left out rather than undefined. */
export function optional<K extends string, V>(key: K, value: V | undefined): { readonly [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { readonly [P in K]?: V };
}

export function enumField<T extends string>(object: JsonObject, path: string, key: string, allowed: readonly T[]): T {
  const value = stringField(object, path, key);
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ContractRejected('FIELD_INVALID', join(path, key), `${join(path, key)} must be one of the known keys`);
  }
  return value as T;
}

/**
 * Opaque document IDs (request, location, area, symptom): letters, digits, `_`, `-`, up to
 * 128 characters. They become Firestore path segments, so `/`, `.` and empty values are refused.
 */
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function idField(object: JsonObject, path: string, key: string): string {
  const value = stringField(object, path, key);
  if (!ID_PATTERN.test(value)) throw new ContractRejected('FIELD_INVALID', join(path, key), `${join(path, key)} is not a valid ID`);
  return value;
}

export function optionalId(object: JsonObject, path: string, key: string): string | undefined {
  return present(object, key) ? idField(object, path, key) : undefined;
}
