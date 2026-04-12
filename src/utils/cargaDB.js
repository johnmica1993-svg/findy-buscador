const DB_NAME = 'FindyCarga';
const DB_VERSION = 1;

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('jobs')) {
        db.createObjectStore('jobs', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('datos')) {
        db.createObjectStore('datos', { keyPath: 'jobId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function guardarJobLocal(jobId, datos, nombreArchivo) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['jobs', 'datos'], 'readwrite');
    tx.objectStore('jobs').put({
      id: jobId, nombreArchivo, total: datos.length,
      chunkActual: 0, procesados: 0
    });
    tx.objectStore('datos').put({ jobId, registros: datos });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function obtenerJobLocal(jobId) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['jobs', 'datos'], 'readonly');
    const jobReq = tx.objectStore('jobs').get(jobId);
    jobReq.onsuccess = () => {
      if (!jobReq.result) return resolve(null);
      const datosReq = tx.objectStore('datos').get(jobId);
      datosReq.onsuccess = () => resolve({
        job: jobReq.result,
        registros: datosReq.result?.registros || []
      });
      datosReq.onerror = () => reject(datosReq.error);
    };
    jobReq.onerror = () => reject(jobReq.error);
  });
}

export async function actualizarChunkLocal(jobId, chunkActual, procesados) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobs', 'readwrite');
    const store = tx.objectStore('jobs');
    const req = store.get(jobId);
    req.onsuccess = () => {
      const job = req.result;
      if (job) {
        job.chunkActual = chunkActual;
        job.procesados = procesados;
        store.put(job);
      }
      tx.oncomplete = () => resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

export async function eliminarJobLocal(jobId) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['jobs', 'datos'], 'readwrite');
    tx.objectStore('jobs').delete(jobId);
    tx.objectStore('datos').delete(jobId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function obtenerJobActivoLocal() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('jobs', 'readonly');
    const req = tx.objectStore('jobs').getAll();
    req.onsuccess = () => {
      const jobs = req.result;
      resolve(jobs.length > 0 ? jobs[jobs.length - 1] : null);
    };
    req.onerror = () => reject(req.error);
  });
}
