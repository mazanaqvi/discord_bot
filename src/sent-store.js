import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function storePath(storeKey) {
  const safe = String(storeKey).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `sent-${safe}.json`);
}

export async function loadSentIds(storeKey) {
  try {
    const raw = await readFile(storePath(storeKey), "utf8");
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.ids) ? parsed.ids : []);
  } catch {
    return new Set();
  }
}

export async function saveSentIds(storeKey, ids) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    storePath(storeKey),
    JSON.stringify({ ids: [...ids], updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function clearSentIds(storeKey) {
  await saveSentIds(storeKey, new Set());
}
