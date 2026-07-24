import {
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from "discord.js";
import "dotenv/config";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

if (!token || !clientId) {
  console.error("Set DISCORD_TOKEN and CLIENT_ID in .env");
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName("dmall")
    .setDescription("Send a private message to every member of this server")
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to DM each member")
        .setRequired(true)
        .setMaxLength(2000)
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Optional channel to also post the announcement in")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

try {
  if (guildId) {
    console.log(`Registering guild commands for ${guildId}...`);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
  } else {
    console.log("Registering global commands (may take up to ~1 hour to appear)...");
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
  }
  console.log("Slash commands registered.");
} catch (err) {
  console.error(err);
  process.exit(1);
}
