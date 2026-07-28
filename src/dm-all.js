import { PermissionFlagsBits } from "discord.js";
import { loadSentIds, saveSentIds, clearSentIds } from "./sent-store.js";

const BATCH_SIZE = 50;
const BATCH_PAUSE_MS = 60_000; // 1 minute between batches
const PER_DM_DELAY_MS = 1500;

/**
 * DM a list of guild members with batching + resume.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').GuildMember[]} members
 * @param {string} message
 * @param {(result: object) => void} [onProgress]
 * @param {{ reset?: boolean, storeKey: string, label?: string }} options
 */
export async function dmMembers(
  guild,
  members,
  message,
  onProgress,
  { reset = false, storeKey, label = guild.name } = {}
) {
  if (!storeKey) {
    throw new Error("storeKey is required for DM resume tracking");
  }

  if (reset) {
    await clearSentIds(storeKey);
    console.log(`[${label}] Cleared sent history (reset=true)`);
  }

  const alreadySent = await loadSentIds(storeKey);

  const result = {
    total: members.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    alreadyMessaged: 0,
    attempted: 0,
    done: false,
    stoppedEarly: false,
    failureSamples: [],
    failureReasons: {},
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
      await saveSentIds(storeKey, alreadySent);
    } catch (err) {
      result.failed += 1;
      consecutiveFails += 1;

      const reason =
        err?.rawError?.message ||
        err?.message ||
        `HTTP ${err?.status ?? err?.code ?? "unknown"}`;
      result.failureReasons[reason] = (result.failureReasons[reason] ?? 0) + 1;
      if (result.failureSamples.length < 5) {
        result.failureSamples.push(`${name}: ${reason}`);
      }
      console.warn(`[${label}] DM failed for ${name} (${member.id}): ${reason}`);

      if (err?.status === 429 || err?.code === 429) {
        const wait = Number(err.retryAfter ?? err.rawError?.retry_after ?? 15) * 1000;
        console.warn(`[${label}] Rate limited, waiting ${Math.ceil(wait / 1000)}s`);
        await sleep(Math.max(wait, 5000));
        consecutiveFails = 0;
      } else if (consecutiveFails >= 25) {
        console.warn(
          `[${label}] Stopping early after ${consecutiveFails} consecutive DM failures. Sent ${result.sent} this run; ${alreadySent.size} total recorded.`
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
        `[${label}] Batch of ${BATCH_SIZE} done — pausing 1 minute (sent this run: ${result.sent})`
      );
      await sleep(BATCH_PAUSE_MS);
      sinceBatchPause = 0;
    }
  }

  result.done = true;
  onProgress?.(result);
  return result;
}

/** DM every human member of the guild. */
export async function dmAllMembers(guild, message, onProgress, { reset = false } = {}) {
  await guild.members.fetch();
  const members = [...guild.members.cache.values()];
  return dmMembers(guild, members, message, onProgress, {
    reset,
    storeKey: guild.id,
    label: guild.name,
  });
}

/**
 * DM human members who can view the given channel.
 * (Discord has no "channel member list" for text — this uses View Channel permission.)
 */
export async function dmChannelMembers(
  guild,
  channel,
  message,
  onProgress,
  { reset = false } = {}
) {
  await guild.members.fetch();

  const members = [...guild.members.cache.values()].filter((member) => {
    try {
      return channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel);
    } catch {
      return false;
    }
  });

  return dmMembers(guild, members, message, onProgress, {
    reset,
    storeKey: `channel-${guild.id}-${channel.id}`,
    label: `${guild.name}/#${channel.name}`,
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
