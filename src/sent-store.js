import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
export const DM_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours

function storePath(storeKey) {
  const safe = String(storeKey).replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(DATA_DIR, `sent-${safe}.json`);
}

/**
 * Returns a Map of userId -> sentAtMs for users still inside the 2-hour cooldown.
 * Older entries are dropped automatically.
 */
export async function loadRecentSent(storeKey) {
  const entries = await readEntries(storeKey);
  const cutoff = Date.now() - DM_COOLDOWN_MS;
  const active = new Map();

  for (const [id, ts] of Object.entries(entries)) {
    if (Number(ts) > cutoff) active.set(id, Number(ts));
  }

  // Persist prune so the file does not grow forever
  if (Object.keys(entries).length !== active.size) {
    await saveEntries(storeKey, Object.fromEntries(active));
  }

  return active;
}

export async function markSent(storeKey, recentMap, userId) {
  recentMap.set(userId, Date.now());
  await saveEntries(storeKey, Object.fromEntries(recentMap));
}

async function readEntries(storeKey) {
  try {
    const raw = await readFile(storePath(storeKey), "utf8");
    const parsed = JSON.parse(raw);

    // New format: { entries: { userId: timestampMs } }
    if (parsed.entries && typeof parsed.entries === "object") {
      return parsed.entries;
    }

    // Legacy permanent list — treat as expired (no longer block forever)
    return {};
  } catch {
    return {};
  }
}

async function saveEntries(storeKey, entries) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    storePath(storeKey),
    JSON.stringify(
      {
        entries,
        cooldownHours: 2,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}
