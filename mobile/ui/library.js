// 목록 이름만 읽어 메뉴를 그리고, 선택한 목록의 곡 데이터만 불러온다.
const SongbookLibrary = (() => {
  let connection;
  function open() {
    if (!connection) connection = new Promise((resolve, reject) => {
      const request = indexedDB.open('songbook-library', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('entries')) request.result.createObjectStore('entries', { keyPath: 'id' });
        if (!request.result.objectStoreNames.contains('songs')) request.result.createObjectStore('songs');
        request.result.createObjectStore('art');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  async function read(store, key) {
    const db = await open();
    const records = db.transaction(store).objectStore(store);
    const request = key === undefined ? records.getAll() : records.get(key);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function write(id, entry, playlist) {
    const db = await open();
    const tx = db.transaction(['entries', 'songs'], 'readwrite');
    const entries = tx.objectStore('entries'), songs = tx.objectStore('songs');
    if (entry) entries.put(entry); else entries.delete(id);
    if (playlist) songs.put(playlist, id); else songs.delete(id);
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || Error('저장 실패'));
    });
  }
  return {
    list: () => read('entries'),
    art: number => read('art', String(number)),
    async setArt(number, art) {
      const tx = (await open()).transaction('art','readwrite');
      tx.objectStore('art').put(art,String(number));
      return new Promise((resolve,reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); });
    },
    get: id => read('songs', id),
    async save(id, playlist) {
      const entry = { id, name: playlist.name, savedAt: Date.now() };
      await write(id, entry, playlist);
      return entry;
    },
    remove: id => write(id, null, null),
  };
})();
