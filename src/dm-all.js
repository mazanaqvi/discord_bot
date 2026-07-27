/**
 * Send a DM to every human member of a guild, with delays and rate-limit
 * backoff to reduce Discord spam / 429 blocks.
 */
export async function dmAllMembers(guild, message, onProgress) {
  await guild.members.fetch();

  const members = [...guild.members.cache.values()];
  const result = {
    total: members.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    attempted: 0,
    done: false,
    stoppedEarly: false,
  };

  // Larger servers need a slower pace or Discord blocks DMs
  const delayMs = members.length > 200 ? 2000 : 1200;
  let consecutiveFails = 0;

  for (const member of members) {
    if (member.user.bot) {
      result.skipped += 1;
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
    } catch (err) {
      result.failed += 1;
      consecutiveFails += 1;

      // Rate limited — wait and continue
      if (err?.status === 429 || err?.code === 429) {
        const wait = Number(err.retryAfter ?? err.rawError?.retry_after ?? 15) * 1000;
        console.warn(`[${guild.name}] Rate limited, waiting ${Math.ceil(wait / 1000)}s`);
        await sleep(Math.max(wait, 5000));
        consecutiveFails = 0;
      } else if (consecutiveFails >= 25) {
        // Discord often soft-blocks after a mass-DM burst; stop instead of burning the queue
        console.warn(
          `[${guild.name}] Stopping early after ${consecutiveFails} consecutive DM failures (likely Discord anti-spam). Sent ${result.sent} so far.`
        );
        result.stoppedEarly = true;
        result.attempted += 1;
        onProgress?.(result);
        break;
      }
    }

    result.attempted += 1;
    onProgress?.(result);
    await sleep(delayMs);
  }

  result.done = true;
  onProgress?.(result);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
