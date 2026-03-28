/**
 * One-time migration script: adds `members`, `memberUids`, and `memberEmails`
 * to all existing projects that don't have them yet.
 *
 * Usage:
 *   npx tsx scripts/migrate-add-members.ts
 *
 * Requires FIREBASE_SERVICE_ACCOUNT_PATH env var pointing to a service account JSON,
 * or you can run it from the browser console adapted version below.
 */

// ── Browser-console version (paste in dev tools while logged in) ─────────────
// This is the recommended approach for a small number of projects.

const BROWSER_MIGRATION = `
// Paste this in the browser console while logged into VVT:
(async () => {
  const { collection, getDocs, updateDoc, doc, getFirestore } = await import('firebase/firestore');
  const db = getFirestore();
  const snap = await getDocs(collection(db, 'projects'));
  let migrated = 0;
  for (const d of snap.docs) {
    const data = d.data();
    if (data.members && data.memberUids) {
      console.log('  skip (already migrated):', data.name);
      continue;
    }
    const uid = data.createdBy;
    if (!uid) {
      console.warn('  skip (no createdBy):', d.id);
      continue;
    }
    await updateDoc(doc(db, 'projects', d.id), {
      members: { [uid]: 'owner' },
      memberUids: [uid],
      memberEmails: [],
    });
    migrated++;
    console.log('  migrated:', data.name);
  }
  console.log('Done! Migrated', migrated, 'projects');
})();
`;

console.log('=== VVT Project Migration: Add Members ===');
console.log('');
console.log('Paste the following in your browser console while logged into VVT:');
console.log('');
console.log(BROWSER_MIGRATION);
