// Person IDs (D-S08-4): Part 6 §6.5 only says `person_id` is stable and separate from the Firebase
// UID, so the key is the lowercase company email from the Admin people CSV (P7-ADMIN-01); the UID is
// bound to it at the first login by matching the verified email.

export const PERSON_EMAIL_DOMAIN = 'tdfb.co';

/** A stored person ID: a lowercase `@tdfb.co` address. */
export function isPersonId(_value: unknown): _value is string {
  throw new Error('isPersonId: not implemented yet (D-S08-4)');
}

/** The person ID for an email cell of the people CSV: trimmed, lowercased, `@tdfb.co` only. */
export function personIdFromCsvEmail(_email: string, _path = 'email'): string {
  throw new Error('personIdFromCsvEmail: not implemented yet (D-S08-4)');
}
