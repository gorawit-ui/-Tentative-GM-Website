// Person IDs (D-S08-4): Part 6 §6.5 only says `person_id` is stable and separate from the Firebase
// UID, so the key is the lowercase company email from the Admin people CSV (P7-ADMIN-01); the UID is
// bound to it at the first login by matching the verified email. Valid as a Firestore document ID.
import { ContractRejected, join, stringField, type JsonObject } from './strict';

export const PERSON_EMAIL_DOMAIN = 'tdfb.co';

/** Lowercase local part: letters, digits, `.`, `_`, `+`, `-`; no leading/trailing/double dot. */
const PERSON_ID_PATTERN = /^(?!\.)(?!.*\.\.)[a-z0-9._+-]{1,64}(?<!\.)@tdfb\.co$/;

/** A stored person ID: a lowercase `@tdfb.co` address. */
export function isPersonId(value: unknown): value is string {
  return typeof value === 'string' && PERSON_ID_PATTERN.test(value);
}

/** The person ID for an email cell of the people CSV: trimmed, lowercased, `@tdfb.co` only. */
export function personIdFromCsvEmail(email: string, path = 'email'): string {
  const personId = email.trim().toLowerCase();
  if (!isPersonId(personId)) {
    throw new ContractRejected('FIELD_INVALID', path, `${path} must be a company email @${PERSON_EMAIL_DOMAIN}`);
  }
  return personId;
}

/** A person ID (D-S08-4): the stored lowercase `@tdfb.co` email, not normalised here. */
export function personIdField(object: JsonObject, path: string, key: string): string {
  const value = stringField(object, path, key);
  if (!isPersonId(value)) throw new ContractRejected('FIELD_INVALID', join(path, key), `${join(path, key)} is not a person ID`);
  return value;
}
