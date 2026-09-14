import NedbStore from '../../src/srv/storage/NedbStore.js';
import MongoStore, {MongoDbHandle} from '../../src/srv/storage/MongoStore.js';
import {generateDocPouchId} from '../../src/srv/storage/IDocStore.js';

/**
 * Behavioral parity tests between the NeDB and MongoDB store
 * implementations. The MongoDB variants only run when a
 * TEST_STORAGE_BACKEND=mongodb run provides an in-memory MongoDB via
 * MONGODB_URI (set by jest globalSetup); the NeDB variants always run.
 */

const NEDB = process.env.TEST_STORAGE_BACKEND === 'mongodb' ? describe.skip : describe;
const MONGO = process.env.TEST_STORAGE_BACKEND === 'mongodb' ? describe : describe.skip;

let mongoStoreCounter = 0;

async function createMongoStore(): Promise<MongoStore> {
    // globalSetup exports MONGODB_URI in the Mongo run
    await MongoDbHandle.connect(process.env.MONGODB_URI!, process.env.MONGODB_DB || 'docpouch_test');
    mongoStoreCounter++;
    return new MongoStore(`store_test_${Date.now()}_${mongoStoreCounter}`, 'Test', 'Test collection');
}

NEDB('NedbStore', () => {
    let store: NedbStore;

    beforeEach(() => {
        store = new NedbStore(undefined, 'Test', 'Test collection');
    });

    test('add generates a 16-char alphanumeric id', async () => {
        const doc = await store.add({name: 'foo'} as any);
        expect(doc._id).toMatch(/^[A-Za-z0-9]{16}$/);
    });

    test('add respects an existing _id', async () => {
        const doc = await store.add({_id: 'custom123', name: 'foo'});
        expect(doc._id).toBe('custom123');
    });

    test('update refuses owner field', async () => {
        const doc = await store.add({_id: 'aaaaaaaaaaaaaaaa', name: 'foo'});
        void doc;
        await expect(store.update('aaaaaaaaaaaaaaaa', {owner: 'x'})).rejects.toThrow('Cannot update owner field');
    });

    test('update refuses operator keys in the payload', async () => {
        await store.add({_id: 'bbbbbbbbbbbbbbbb', name: 'foo'});
        await expect(store.update('bbbbbbbbbbbbbbbb', {$where: '1'} as any)).rejects.toThrow('disallowed operator keys');
    });

    test('upsert with operator doc inserts query base plus $set', async () => {
        // NeDB semantics: no match -> insert deep copy of query with operators applied
        await store.updateOne({uid: 'u1'}, {$set: {kind: 'Session'}}, {upsert: true});
        const found = await store.findOne({uid: 'u1'});
        expect(found).not.toBeNull();
        expect(found!.kind).toBe('Session');
    });

    test('upsert with plain doc inserts the update as-is (no query merge)', async () => {
        // NeDB semantics: the plain update object is inserted as-is; the
        // query's fields (including _id) are NOT part of the new document.
        // The insert gets a freshly generated id.
        await store.updateOne({_id: 'cccccccccccccccc'}, {client_id: 'abc'}, {upsert: true});
        const found = await store.findOne({client_id: 'abc'});
        expect(found).not.toBeNull();
        expect(found!._id).not.toBe('cccccccccccccccc');
        expect(found!._id).toMatch(/^[A-Za-z0-9]{16}$/);
        expect(Object.keys(found!)).not.toContain('uid'); // query fields must NOT be merged
    });

    test('upsert with plain doc preserves an _id inside the update doc', async () => {
        // The DatabaseWrapper import path relies on this: it passes
        // {...doc, _id: oldId} to store.add for cross-instance imports.
        await store.updateOne({name: 'x'}, {_id: 'fixedid0000000001', client_id: 'def'}, {upsert: true});
        const found = await store.findOne({_id: 'fixedid0000000001'});
        expect(found).not.toBeNull();
        expect(found!.client_id).toBe('def');
    });

    test('remove defaults to multi', async () => {
        await store.insertMany([{_id: 'd1', g: 1}, {_id: 'd2', g: 1}]);
        const n = await store.remove({g: 1});
        expect(n).toBe(2);
    });

    test('update returns 0 for a missing document', async () => {
        const n = await store.update('doesnotexist123', {name: 'x'});
        expect(n).toBe(0);
    });
});

MONGO('MongoStore', () => {
    test('add generates a 16-char alphanumeric id', async () => {
        const store = await createMongoStore();
        const doc = await store.add({name: 'foo'} as any);
        expect(doc._id).toMatch(/^[A-Za-z0-9]{16}$/);
    });

    test('add respects an existing _id', async () => {
        const store = await createMongoStore();
        const doc = await store.add({_id: 'custom123', name: 'foo'});
        expect(doc._id).toBe('custom123');
    });

    test('update refuses owner field', async () => {
        const store = await createMongoStore();
        await store.add({_id: 'aaaaaaaaaaaaaaaa', name: 'foo'});
        await expect(store.update('aaaaaaaaaaaaaaaa', {owner: 'x'})).rejects.toThrow('Cannot update owner field');
    });

    test('update refuses operator keys in the payload', async () => {
        const store = await createMongoStore();
        await store.add({_id: 'bbbbbbbbbbbbbbbb', name: 'foo'});
        await expect(store.update('bbbbbbbbbbbbbbbb', {$where: '1'} as any)).rejects.toThrow('disallowed operator keys');
    });

    test('upsert with operator doc inserts query base plus $set', async () => {
        const store = await createMongoStore();
        await store.updateOne({uid: 'u1'}, {$set: {kind: 'Session'}}, {upsert: true});
        const found = await store.findOne({uid: 'u1'});
        expect(found).not.toBeNull();
        expect(found!.kind).toBe('Session');
    });

    test('upsert with plain doc inserts the update as-is (no query merge)', async () => {
        const store = await createMongoStore();
        await store.updateOne({_id: 'cccccccccccccccc'}, {client_id: 'abc'}, {upsert: true});
        const found = await store.findOne({client_id: 'abc'});
        expect(found).not.toBeNull();
        expect(found!._id).not.toBe('cccccccccccccccc');
        expect(found!._id).toMatch(/^[A-Za-z0-9]{16}$/);
        expect(Object.keys(found!)).not.toContain('uid');
    });

    test('upsert with plain doc preserves an _id inside the update doc', async () => {
        const store = await createMongoStore();
        await store.updateOne({name: 'x'}, {_id: 'fixedid0000000001', client_id: 'def'}, {upsert: true});
        const found = await store.findOne({_id: 'fixedid0000000001'});
        expect(found).not.toBeNull();
        expect(found!.client_id).toBe('def');
    });

    test('remove defaults to multi', async () => {
        const store = await createMongoStore();
        await store.insertMany([{_id: 'd1', g: 1}, {_id: 'd2', g: 1}]);
        const n = await store.remove({g: 1});
        expect(n).toBe(2);
    });

    test('update returns 0 for a missing document', async () => {
        const store = await createMongoStore();
        const n = await store.update('doesnotexist123', {name: 'x'});
        expect(n).toBe(0);
    });

    test('upsert tolerates undefined property values', async () => {
        const store = await createMongoStore();
        const payload: Record<string, any> = {kind: 'Session', accountId: undefined};
        await expect(store.updateOne({uid: 'u9'}, {$set: payload}, {upsert: true})).resolves.toBe(1);
    });
});

describe('generateDocPouchId', () => {
    test('matches the NeDB id format', () => {
        for (let i = 0; i < 100; i++) {
            expect(generateDocPouchId()).toMatch(/^[A-Za-z0-9]{16}$/);
        }
    });
});