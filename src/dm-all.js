import { PermissionFlagsBits } from "discord.js";
import { loadSentIds, saveSentIds, clearSentIds } from "./sent-store.js";

const BATCH_SIZE = 20;
const BATCH_PAUSE_MS = 15_000; // 15 seconds between batches
const PER_DM_DELAY_MS = 2000; // 2 seconds between DMs
const MAX_CONSECUTIVE_FAILS = 10;

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
      } else if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
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
        `[${label}] Batch of ${BATCH_SIZE} done — pausing ${BATCH_PAUSE_MS / 1000}s (sent this run: ${result.sent})`
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
  await fetchGuildMembersSafe(guild, guild.name);
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
  await fetchGuildMembersSafe(guild, `${guild.name}/#${channel.name}`);

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

/**
 * Fetch members with retry — Discord rate-limits gateway opcode 8 (Request Guild Members).
 */
async function fetchGuildMembersSafe(guild, label) {
  const expected = guild.memberCount || 0;
  const cached = guild.members.cache.size;

  // Reuse cache when it's already mostly populated (avoids opcode 8 spam)
  if (cached > 0 && (expected === 0 || cached >= expected * 0.8 || cached >= 50)) {
    console.log(`[${label}] Using member cache (${cached}/${expected || "?"})`);
    return;
  }

  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      await guild.members.fetch();
      console.log(`[${label}] Fetched members (${guild.members.cache.size})`);
      return;
    } catch (err) {
      const msg = String(err?.message ?? err);
      const isOpcode8 =
        msg.includes("opcode 8") ||
        msg.toLowerCase().includes("rate limited") ||
        err?.code === 429;

      if (!isOpcode8) throw err;

      const match = msg.match(/Retry after ([\d.]+)/i);
      const waitMs = Math.ceil((match ? Number(match[1]) : 3) * 1000) + 750;
      console.warn(
        `[${label}] Member fetch rate limited (attempt ${attempt}/6), waiting ${(waitMs / 1000).toFixed(1)}s`
      );
      await sleep(waitMs);
    }
  }

  if (guild.members.cache.size > 0) {
    console.warn(
      `[${label}] Continuing with partial member cache (${guild.members.cache.size})`
    );
    return;
  }

  throw new Error(
    "Discord rate-limited member list fetch. Wait ~1 minute, then run the command again."
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
