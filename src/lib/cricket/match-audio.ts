export const AUDIO_EVENT = "crease-match-audio";
export const AUDIO_KEY = "crease-match-audio-enabled";
export const AUDIO_SECONDS = 90;

export async function localTrack(file?: File | null): Promise<File | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("crease-match-audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("tracks");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", file === undefined ? "readonly" : "readwrite");
      const store = tx.objectStore("tracks");
      const request =
        file === undefined
          ? store.get("horn")
          : file === null
            ? store.delete("horn")
            : store.put(file, "horn");
      tx.oncomplete = () => resolve(file === undefined ? (request.result ?? null) : file);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
