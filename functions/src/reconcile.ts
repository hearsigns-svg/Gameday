// Weekly reconciliation: find fixtures that are the same real-world
// event arriving from different providers, and collapse them so a user
// following two overlapping things sees ONE calendar entry.
//
// The merge keeps the id users already have and applies the most
// trustworthy record's data to it, so the calendar sees an update, not a
// delete-and-recreate that would destroy their reminders.

import { getFirestore } from 'firebase-admin/firestore';
import { Fixture } from './fixture';
import { clusterFixtures, mergeCluster } from './identity';

export interface ReconcileResult {
  scanned: number;
  clusters: number;
  merged: number;
  dropped: number;
  examples: string[];
  dryRun: boolean;
}

// Only reconcile fixtures that can still matter to a calendar; rewriting
// history costs writes and changes nothing anyone sees.
const LOOKBACK_DAYS = 7;

export async function reconcileFixtures(
  dryRun: boolean,
): Promise<ReconcileResult> {
  const db = getFirestore();
  const from = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const snap = await db
    .collection('fixtures')
    .where('startUtc', '>=', from)
    .get();
  const fixtures = snap.docs.map((d) => d.data() as Fixture);

  const clusters = clusterFixtures(fixtures);
  const examples: string[] = [];
  let merged = 0;
  let dropped = 0;

  for (const cluster of clusters) {
    const decision = mergeCluster(cluster);
    if (examples.length < 10) {
      examples.push(
        `${decision.data.title} [keep ${decision.keepId}] ← ${decision.dropIds.join(', ')}`,
      );
    }
    if (dryRun) {
      merged++;
      dropped += decision.dropIds.length;
      continue;
    }
    const batch = db.batch();
    batch.set(db.collection('fixtures').doc(decision.keepId), decision.data);
    for (const id of decision.dropIds) {
      batch.delete(db.collection('fixtures').doc(id));
    }
    await batch.commit();
    merged++;
    dropped += decision.dropIds.length;
  }

  const result: ReconcileResult = {
    scanned: fixtures.length,
    clusters: clusters.length,
    merged,
    dropped,
    examples,
    dryRun,
  };
  if (!dryRun) {
    await db
      .collection('reconciliations')
      .doc(new Date().toISOString())
      .set({ ...result, at: new Date().toISOString() });
  }
  return result;
}
