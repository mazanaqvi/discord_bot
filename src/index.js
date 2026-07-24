import {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits,
  MessageFlags,
} from "discord.js";
import "dotenv/config";
import { dmAllMembers } from "./dm-all.js";

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
  if (interaction.commandName !== "dmall") return;

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

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    if (channel?.isTextBased()) {
      await channel.send({
        content: `📢 Broadcast started by ${interaction.user}:\n${message}`,
      });
    }

    const result = await dmAllMembers(interaction.guild, message, (progress) => {
      // Progress is logged; Discord ephemeral edits are rate-limited
      if (progress.attempted % 10 === 0 || progress.done) {
        console.log(
          `[${interaction.guild.name}] DM progress: ${progress.sent} sent, ${progress.failed} failed, ${progress.skipped} skipped / ${progress.total}`
        );
      }
    });

    await interaction.editReply({
      content: [
        "DM broadcast finished.",
        `• Members considered: **${result.total}**`,
        `• Sent: **${result.sent}**`,
        `• Failed (DMs closed / blocked / rate limit): **${result.failed}**`,
        `• Skipped (bots): **${result.skipped}**`,
        channel ? `• Also posted in: ${channel}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    });
  } catch (err) {
    console.error(err);
    await interaction.editReply({
      content: `Broadcast failed: ${err.message ?? String(err)}`,
    });
  }
});

client.login(token);
