import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import "dotenv/config";
import { dmAllMembers, dmChannelMembers } from "./dm-all.js";
import { formatMessage } from "./format-message.js";

const token = process.env.DISCORD_TOKEN;

if (!token || token === "your_bot_token_here") {
  console.error("Set DISCORD_TOKEN in .env (copy from .env.example).");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
  console.log(
    `Invite URL:\nhttps://discord.com/oauth2/authorize?client_id=${readyClient.user.id}&permissions=2048&scope=bot%20applications.commands`
  );
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "dmc") {
    await handleDmc(interaction);
    return;
  }

  if (interaction.commandName === "dmall") {
    await handleDmall(interaction);
  }
});

async function handleDmc(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "This command only works inside a server channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "You need Administrator permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const message = interaction.options.getString("message", true);
  const reset = interaction.options.getBoolean("reset") ?? false;
  const channel = interaction.channel;

  if (!channel?.isTextBased()) {
    await interaction.reply({
      content: "This command must be used in a text channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const result = await dmChannelMembers(
      interaction.guild,
      channel,
      message,
      (progress) => {
        if (progress.attempted % 10 === 0 || progress.done) {
          console.log(
            `[${interaction.guild.name}/#${channel.name}] DM progress: ${progress.sent} sent, ${progress.failed} failed, ${progress.alreadyMessaged} cooldown, ${progress.skipped} bots / ${progress.total}`
          );
        }
      },
      { reset }
    );

    await interaction.editReply({
      content: [
        result.stoppedEarly
          ? "Channel DM run **stopped early** (Discord blocking). Wait, then run `/dmc` again."
          : "Channel DM run finished.",
        `• Channel: ${channel}`,
        `• Members who can see this channel: **${result.total}**`,
        `• Sent this run: **${result.sent}**`,
        `• Skipped (messaged within last **2 hours**): **${result.alreadyMessaged}**`,
        `• Failed: **${result.failed}**`,
        `• Skipped (bots): **${result.skipped}**`,
        `• Pace: **2s**/DM, **20** DMs → **15s** pause`,
        reset ? "• **2-hour cooldown was cleared** (reset: True)" : null,
        ...formatFailureDetails(result),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    console.error(err);
    await interaction.editReply({
      content: `Channel DM failed: ${err.message ?? String(err)}`,
    });
  }
}

async function handleDmall(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "This command only works inside a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "You need Administrator permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const message = interaction.options.getString("message", true);
  const channel = interaction.options.getChannel("channel");
  const reset = interaction.options.getBoolean("reset") ?? false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    let channelNote = null;
    if (channel?.isTextBased()) {
      try {
        await channel.send({
          content: `📢 Broadcast started by ${interaction.user}:\n${formatMessage(message)}`.slice(
            0,
            2000
          ),
        });
        channelNote = `• Also posted in: ${channel}`;
      } catch (channelErr) {
        console.warn("Channel announce failed:", channelErr);
        channelNote =
          `• Could not post in ${channel} (bot needs **View Channel** + **Send Messages** there)`;
      }
    }

    const me = interaction.guild.members.me;
    if (me && !me.permissions.has(PermissionFlagsBits.ViewChannel)) {
      throw new Error(
        "Bot cannot view channels in this server. Re-invite it or fix role permissions."
      );
    }

    const result = await dmAllMembers(
      interaction.guild,
      message,
      (progress) => {
        if (progress.attempted % 10 === 0 || progress.done) {
          console.log(
            `[${interaction.guild.name}] DM progress: ${progress.sent} sent, ${progress.failed} failed, ${progress.alreadyMessaged} cooldown, ${progress.skipped} bots / ${progress.total}`
          );
        }
      },
      { reset }
    );

    await interaction.editReply({
      content: [
        result.stoppedEarly
          ? "DM broadcast **stopped early** (Discord blocking). Wait a bit, then run `/dmall` again."
          : "DM broadcast finished.",
        `• Members considered: **${result.total}**`,
        `• Sent this run: **${result.sent}**`,
        `• Skipped (messaged within last **2 hours**): **${result.alreadyMessaged}**`,
        `• Failed (DMs closed / blocked / rate limit): **${result.failed}**`,
        `• Skipped (bots): **${result.skipped}**`,
        `• Pace: **2s**/DM, **20** DMs → **15s** pause`,
        reset ? "• **2-hour cooldown was cleared** (reset: True)" : null,
        channelNote,
        ...formatFailureDetails(result),
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    console.error(err);
    const detail = err.message ?? String(err);
    const hint =
      detail.includes("Missing Permissions") || err.code === 50013
        ? "\n\nFix bot **View Channel** + **Send Messages**, or run `/dmall` without the channel option."
        : "";
    await interaction.editReply({
      content: `Broadcast failed: ${detail}${hint}`,
    });
  }
}

client.login(token);

function formatFailureDetails(result) {
  if (!result.failed || !result.failureSamples?.length) return [];
  return [
    "",
    "**Why DMs failed (samples):**",
    ...result.failureSamples.map((s) => `• ${s}`),
  ];
}
