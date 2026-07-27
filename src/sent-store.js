import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

function storePath(guildId) {
  return path.join(DATA_DIR, `sent-${guildId}.json`);
}

export async function loadSentIds(guildId) {
  try {
    const raw = await readFile(storePath(guildId), "utf8");
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed.ids) ? parsed.ids : []);
  } catch {
    return new Set();
  }
}

export async function saveSentIds(guildId, ids) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    storePath(guildId),
    JSON.stringify({ ids: [...ids], updatedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}

export async function clearSentIds(guildId) {
  await saveSentIds(guildId, new Set());
}
