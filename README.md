# Nullo

Slack bot for **This Alien Does Not Exist**. Nullo uses the deployed website's browser API and renderer; it does not contain a fork of the generator.

## Requirements

- Node.js 22+
- npm
- Slack app with Socket Mode enabled
- Chromium installed through Playwright

## Setup

```bash
npm install
npx playwright install chromium
```

Copy `.env.example` to `.env` and fill in the newly generated Slack tokens:

```dotenv
ALIEN_SITE_BASE=https://thisaliendoesnotexist.app/
SLACK_BOT_TOKEN=xoxb-your-new-token
SLACK_APP_TOKEN=xapp-your-new-token
```

`ALIEN_SITE_BASE` must be a plain URL. Do not include Markdown brackets or parentheses.

## Test the website before Slack

```bash
npm run probe
```

This checks the schema, generates seed 42, renders its canvas and writes `alien-42.png`.

## Run locally

```bash
npm start
```

## Slack slash commands to register

Register these exact command names in **Slack API → Your App → Slash Commands**:

| Command | Description | Usage hint |
|---|---|---|
| `/nullo-ping` | Check Nullo and website connectivity | |
| `/nullo` | Discover or generate an alien | `42`, `random`, `raw`, or `help` |
| `/nullo-duel` | Run an alien duel | `[left-seed] [right-seed]` |
| `/nullo-pick` | Randomly choose between options | `pizza \| noodles \| tacos` |

The names in Slack must match the names registered in `app.mjs`. Socket Mode means no public Request URL is required.

Invite the bot to the test channel before using it there.

## Slack permissions

Bot Token Scopes:

- `commands`
- `chat:write`
- `files:write`

App-Level Token:

- `connections:write`

No user scopes are needed for this command set.

## Security

- Never commit `.env`.
- Rotate any token that has been pasted into a chat, issue, commit, screenshot or log.
- Store production secrets in a private environment file on Nest, not in the repository.
- Do not print tokens in logs.

## Nest

Apply at [nest.hackclub.com/application](https://nest.hackclub.com/application). Once approved, follow the Nest Quickstart to connect with SSH and use the deployment instructions supplied for your account. Nest is a Linux container; a persistent service manager is needed to keep the process running after disconnecting.

A basic deployment sequence after SSH access:

```bash
git clone https://github.com/YOUR_USERNAME/nullo.git
cd nullo
npm install
npx playwright install chromium
cp .env.example .env
nano .env
npm start
```

For 24/7 operation, use the systemd or process-supervisor method supported by your Nest account. Do not assume `sudo` or root access; confirm the permissions provided to your container first. If systemd is unavailable, ask in the Hack Club `#nest` channel which persistent process manager is supported for your account.

## Troubleshooting

- `Invalid URL`: check that `ALIEN_SITE_BASE` is exactly `https://thisaliendoesnotexist.app/`.
- `app did not respond`: check the terminal for the handler error and verify that the exact slash command is registered in Slack.
- `not_in_channel`: invite Nullo to the channel.
- Playwright executable missing: run `npx playwright install chromium`.
- Website API errors: run `npm run probe` before debugging Slack.
