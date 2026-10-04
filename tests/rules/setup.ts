// Rules tests only run against local emulators of a demo-* project; never a real project.
const project = process.env.GCLOUD_PROJECT ?? '';
const firestore = process.env.FIRESTORE_EMULATOR_HOST;
const storage = process.env.FIREBASE_STORAGE_EMULATOR_HOST;

if (!project.startsWith('demo-') || !firestore || !storage) {
  throw new Error('Run these tests with `npm run test:rules` (Firebase emulators on a demo-* project).');
}
