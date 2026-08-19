import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import fs from 'node:fs';

let env;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'mypypath-username-rules-test',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => { await env.cleanup(); });

async function seed(name, uid) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'usernames', name), {
      uid,
      createdAt: Date.now(),
    });
  });
}

describe('usernames reservations: read', () => {
  it('lets an anonymous visitor get a username doc', async () => {
    await seed('taken_public', 'alice');
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'usernames/taken_public')));
  });

  it('lets an anonymous visitor get a free (missing) username doc', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(db, 'usernames/definitely_free')));
  });

  it('lets a signed-in user get a username doc', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(db, 'usernames/taken_public')));
  });

  it('denies listing the collection anonymously', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, 'usernames')));
  });

  it('denies listing the collection when signed in', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertFails(getDocs(collection(db, 'usernames')));
  });
});

describe('usernames reservations: create', () => {
  it('lets a signed-in user claim a free name', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(
      setDoc(doc(db, 'usernames/alice_name'), { uid: 'alice', createdAt: Date.now() })
    );
  });

  it('denies a create whose uid is not the caller', async () => {
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, 'usernames/spoofed'), { uid: 'alice', createdAt: Date.now() })
    );
  });

  it('denies a create from an anonymous caller', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(db, 'usernames/anon_name'), { uid: 'alice', createdAt: Date.now() })
    );
  });

  it('denies a create carrying an extra field', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'usernames/extra_field'), {
        uid: 'alice',
        createdAt: Date.now(),
        admin: true,
      })
    );
  });

  it('denies a create missing createdAt', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'usernames/no_created_at'), { uid: 'alice' }));
  });

  it('denies claiming a name someone else already reserved', async () => {
    await seed('already_taken', 'alice');
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(
      setDoc(doc(db, 'usernames/already_taken'), { uid: 'mallory', createdAt: Date.now() })
    );
  });

  it('denies re-claiming your own already reserved name', async () => {
    await seed('alice_again', 'alice');
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(
      setDoc(doc(db, 'usernames/alice_again'), { uid: 'alice', createdAt: Date.now() })
    );
  });
});

describe('usernames reservations: update', () => {
  it('denies an update from the owner', async () => {
    await seed('owner_update', 'alice');
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(updateDoc(doc(db, 'usernames/owner_update'), { uid: 'alice' }));
  });

  it('denies an update from another user', async () => {
    await seed('other_update', 'alice');
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(updateDoc(doc(db, 'usernames/other_update'), { uid: 'mallory' }));
  });

  it('denies an update from an anonymous caller', async () => {
    await seed('anon_update', 'alice');
    const db = env.unauthenticatedContext().firestore();
    await assertFails(updateDoc(doc(db, 'usernames/anon_update'), { uid: 'alice' }));
  });
});

describe('usernames reservations: delete', () => {
  it('lets the owner release their name', async () => {
    await seed('alice_release', 'alice');
    const db = env.authenticatedContext('alice').firestore();
    await assertSucceeds(deleteDoc(doc(db, 'usernames/alice_release')));
  });

  it('denies a different user deleting the reservation', async () => {
    await seed('alice_keep', 'alice');
    const db = env.authenticatedContext('mallory').firestore();
    await assertFails(deleteDoc(doc(db, 'usernames/alice_keep')));
  });

  it('denies an anonymous caller deleting the reservation', async () => {
    await seed('alice_keep_anon', 'alice');
    const db = env.unauthenticatedContext().firestore();
    await assertFails(deleteDoc(doc(db, 'usernames/alice_keep_anon')));
  });
});
