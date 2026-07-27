import { loadSentIds, saveSentIds, clearSentIds } from "./sent-store.js";

const BATCH_SIZE = 50;
const BATCH_PAUSE_MS = 60_000; // 1 minute between batches
const PER_DM_DELAY_MS = 1500;

/**
 * Send a DM to every human member of a guild.
 * - Skips members already messaged (resume-safe)
 * - After every 50 DMs, pauses 1 minute
 * - Backs off on rate limits / consecutive failures
 */
export async function dmAllMembers(guild, message, onProgress, { reset = false } = {}) {
  await guild.members.fetch();

  if (reset) {
    await clearSentIds(guild.id);
    console.log(`[${guild.name}] Cleared sent history (reset=true)`);
  }

  const alreadySent = await loadSentIds(guild.id);
  const members = [...guild.members.cache.values()];

  const result = {
    total: members.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    alreadyMessaged: 0,
    attempted: 0,
    done: false,
    stoppedEarly: false,
  };

  let consecutiveFails = 0;
  let sinceBatchPause = 0;

  for (const member of members) {
    if (member.user.bot) {
      result.skipped += 1;
      result.attempted += 1;
      onProgress?.(result);
      continue;
    }

    if (alreadySent.has(member.id)) {
      result.alreadyMessaged += 1;
      result.attempted += 1;
      onProgress?.(result);
      continue;
    }

    const name =
      member.displayName ||
      member.user.globalName ||
      member.user.username;
    const personalized = `Hi, ${name},\n\n${message}`.slice(0, 2000);

    try {
      await member.send(personalized);
      result.sent += 1;
      consecutiveFails = 0;
      alreadySent.add(member.id);
      // Persist after each success so a restart can resume safely
      await saveSentIds(guild.id, alreadySent);
    } catch (err) {
      result.failed += 1;
      consecutiveFails += 1;

      if (err?.status === 429 || err?.code === 429) {
        const wait = Number(err.retryAfter ?? err.rawError?.retry_after ?? 15) * 1000;
        console.warn(`[${guild.name}] Rate limited, waiting ${Math.ceil(wait / 1000)}s`);
        await sleep(Math.max(wait, 5000));
        consecutiveFails = 0;
      } else if (consecutiveFails >= 25) {
        console.warn(
          `[${guild.name}] Stopping early after ${consecutiveFails} consecutive DM failures (likely Discord anti-spam). Sent ${result.sent} this run; ${alreadySent.size} total recorded.`
        );
        result.stoppedEarly = true;
        result.attempted += 1;
        onProgress?.(result);
        break;
      }
    }

    result.attempted += 1;
    sinceBatchPause += 1;
    onProgress?.(result);

    await sleep(PER_DM_DELAY_MS);

    if (sinceBatchPause >= BATCH_SIZE && !result.stoppedEarly) {
      console.log(
        `[${guild.name}] Batch of ${BATCH_SIZE} done — pausing 1 minute before next batch (sent this run: ${result.sent})`
      );
      await sleep(BATCH_PAUSE_MS);
      sinceBatchPause = 0;
    }
  }

  result.done = true;
  onProgress?.(result);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
