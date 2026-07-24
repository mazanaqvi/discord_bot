# Discord DM broadcast bot

Bot that can DM **every human member** of a server individually, and optionally post the same text in a channel.

## Setup

1. Create an app at [Discord Developer Portal](https://discord.com/developers/applications) → **New Application**.
2. Open **Bot** → **Add Bot** → copy the token.
3. Under **Bot → Privileged Gateway Intents**, enable:
   - **Server Members Intent** (required to list members)
4. Copy `.env.example` to `.env` and fill in:

```env
DISCORD_TOKEN=...
CLIENT_ID=...          # Application ID from the General Information tab
GUILD_ID=...           # optional; your test server ID for instant slash commands
```

5. Install and register the slash command:

```bash
npm install
npm run register-commands
npm start
```

6. Invite the bot (replace `CLIENT_ID`):

```
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2048&scope=bot%20applications.commands
```

`2048` = Send Messages. The bot also needs to be able to DM users (no special invite bit; users must allow DMs from server members).

## Usage

In any server where the bot is present (and you are an **Administrator**):

```
/dmall message: Hello everyone — please read the new rules.
```

Optional channel announcement:

```
/dmall message: Hello everyone channel: #announcements
```

## Behavior

- Skips other bots
- Sends one DM per second to reduce rate limits
- Reports how many DMs succeeded / failed (closed DMs, blocks, etc.)
- Only Administrators can run `/dmall`

## Important

Mass DMing can look like spam. Use only with clear consent / for legitimate server notices, and respect Discord’s Terms of Service and rate limits. Large servers will take a long time (~1 second per member).
