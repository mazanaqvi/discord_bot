/**
 * Send a DM to every human member of a guild, with a short delay between
 * sends to reduce Discord rate-limit / spam-flag risk.
 */
export async function dmAllMembers(guild, message, onProgress) {
  // Ensure the member cache is populated (requires Server Members Intent)
  await guild.members.fetch();

  const members = [...guild.members.cache.values()];
  const result = {
    total: members.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    attempted: 0,
    done: false,
  };

  for (const member of members) {
    if (member.user.bot) {
      result.skipped += 1;
      result.attempted += 1;
      onProgress?.(result);
      continue;
    }

    try {
      await member.send(message);
      result.sent += 1;
    } catch {
      // Common when the user has DMs disabled or has blocked the bot
      result.failed += 1;
    }

    result.attempted += 1;
    onProgress?.(result);

    // ~1 message / second — stay under Discord's DM rate limits
    await sleep(1000);
  }

  result.done = true;
  onProgress?.(result);
  return result;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
