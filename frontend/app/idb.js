// Minimal IndexedDB wrapper for offline-first entry capture. Two stores:
// "entries" (JSON-shaped records, keyed by client-generated id - matching
// the backend's Entry.id field name exactly, not "uuid") and "photos"
// (holds the actual Blob, keyed by an autoincrement local_id and indexed
// on entry_id) - kept separate because a photo's Blob doesn't belong
// inlined into the same record you're POSTing as JSON.
const IDB = (() => {
  const DB_NAME = "nb_db";
  const DB_VERSION = 1;
  const ENTRIES = "entries";
  const PHOTOS = "photos";
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        // Drop and recreate on any schema change, rather than guarding with
        // objectStoreNames.contains - simpler to reason about while this
        // schema is still settling, and this is a local write-ahead queue,
        // not data anyone needs preserved across a schema bump.
        if (db.objectStoreNames.contains(ENTRIES)) db.deleteObjectStore(ENTRIES);
        if (db.objectStoreNames.contains(PHOTOS)) db.deleteObjectStore(PHOTOS);
        db.createObjectStore(ENTRIES, { keyPath: "id" });
        const photoStore = db.createObjectStore(PHOTOS, { keyPath: "local_id", autoIncrement: true });
        photoStore.createIndex("entry_id", "entry_id");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  async function tx(store, mode) {
    const db = await open();
    return db.transaction(store, mode).objectStore(store);
  }

  return {
    async addEntry(entry) {
      const store = await tx(ENTRIES, "readwrite");
      store.put(entry);
    },
    async getAllEntries() {
      const store = await tx(ENTRIES, "readonly");
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
      });
    },
    async getUnsyncedEntries() {
      const all = await this.getAllEntries();
      return all.filter((e) => !e.synced);
    },
    // Called when an entry is archived on the server. The local write-ahead
    // copy has done its job by then, and leaving it behind means the entry
    // reappears in the list the next time the device is offline (where the
    // local store is the only source of truth) and that this store grows
    // without bound.
    async deleteEntry(id) {
      const store = await tx(ENTRIES, "readwrite");
      store.delete(id);
    },
    async markEntrySynced(id) {
      const store = await tx(ENTRIES, "readwrite");
      const getReq = store.get(id);
      return new Promise((resolve) => {
        getReq.onsuccess = () => {
          const rec = getReq.result;
          if (rec) { rec.synced = true; store.put(rec); }
          resolve();
        };
      });
    },

    async addPhoto(photo) {
      const store = await tx(PHOTOS, "readwrite");
      store.add(photo);
    },
    async getPhotosForEntry(entryId) {
      const store = await tx(PHOTOS, "readonly");
      return new Promise((resolve) => {
        const idx = store.index("entry_id");
        const req = idx.getAll(entryId);
        req.onsuccess = () => resolve(req.result);
      });
    },
    async getAllPhotos() {
      const store = await tx(PHOTOS, "readonly");
      return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
      });
    },
    async getUnsyncedPhotos() {
      const all = await this.getAllPhotos();
      return all.filter((p) => !p.synced);
    },
    async deletePhoto(localId) {
      const store = await tx(PHOTOS, "readwrite");
      store.delete(localId);
    },

    async getUnsyncedCounts() {
      const [entries, photos] = await Promise.all([this.getUnsyncedEntries(), this.getUnsyncedPhotos()]);
      return { entries: entries.length, photos: photos.length };
    },
  };
})();
