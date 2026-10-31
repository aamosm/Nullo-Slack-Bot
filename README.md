# Nullo

This Alien Does Not Exist, in Slack. Discover and keep aliens, fight random opponents, and settle channel decisions with a battle or an equal-chance pick.

Nullo opens https://thisaliendoesnotexist.app/ in headless Chromium, imports the site's public `alien-api.js`, and uses its generation and combat results. Portraits come from the website's actual canvas in Quick mode. The alien engine is not copied into this repository. The static site has a browser API; it does not need a separate JSON server for this bot.

## 1. Replace the starter files

Stop the old bot with Ctrl+C. Extract this ZIP, open its `nullo` folder, and copy everything inside into your existing **bot** folder. Replace matching files, including `package.json`, `package-lock.json`, `app.mjs` and `.gitignore`. Keep your existing Git repository. This is a separate project from the alien website.

Old starter files such as `index.js`, `website.mjs` and `probe.mjs` are no longer used: `npm start` runs the new `app.mjs`, and scripts live under `scripts/`. Remove old starter files only if they contain no work you need. There is no need to initialize Git again if you already have an initial commit.

Install **Node.js 24 LTS** from https://nodejs.org/download. Open a new terminal afterward. Run these commands from the folder containing this README:

```sh
node --version
npm ci
npm run setup
```

The Node version should begin with `v24.`. `npm ci` installs the exact dependencies in the lockfile. `npm run setup` downloads Chromium. On Linux, if browser libraries are missing, run `npx playwright install --with-deps chromium`; the Nest installer handles this.

## 2. Register the Slack app

Open https://api.slack.com/apps and select your existing Nullo app. In **App Manifest**, select JSON and replace the manifest with the contents of `slack-app-manifest.json`. Save it. For a new app, choose **Create New App → From a manifest**, select your workspace, and paste that same file.

The manifest registers these five slash commands and enables Socket Mode and Interactivity:

| Command | Short description | Usage hint |
| --- | --- | --- |
| `/nullo` | Discover aliens and manage your collection | `[random \| raw \| SEED \| mine \| active SEED \| help]` |
| `/nullo-duel` | Fight a random alien or two exact seeds | `[SEED] [OPPONENT_SEED]` |
| `/nullo-pick` | Choose fairly between distinct options | `option \| option \| option` |
| `/nullo-decide` | Let two aliens battle to decide | `option \| option` |
| `/nullo-ping` | Check Nullo and its website connection | `[site \| image]` |

You register these in your **Slack app**, under Slash Commands, not in a channel or in a ping service. `random`, `mine`, and `active` are arguments to `/nullo`; they are not separate registrations. Use `/nullo-ping`, rather than taking the generic `/ping` command. Check your workspace for existing commands with these names. If there is a collision, change the command names in the manifest, `src/bot.mjs`, and help text before installing.

Under **OAuth & Permissions**, the bot needs only `commands`, `chat:write`, and `files:write`. Install or reinstall the app to your workspace after changing scopes. Copy its **Bot User OAuth Token** into `SLACK_BOT_TOKEN`.

Under **Basic Information → App-Level Tokens**, generate a token with `connections:write`. Put that token in `SLACK_APP_TOKEN`. Check that **Socket Mode** and **Interactivity & Shortcuts** are enabled. Both tokens must belong to this same Slack app. No request URL, public port, domain, signing secret or incoming webhook is needed for this Socket Mode setup.

Tokens pasted into a conversation should be replaced before deployment. Revoke the old app-level token in its app settings and generate a replacement. For the bot token, revoke the exposed installation token and reinstall the app to obtain a new one; merely copying the existing token again does not rotate it. If your workspace requires installation approval, complete that approval before testing.

## 3. Create the local environment file

The ZIP intentionally contains `.env.example`, not a real `.env`. If you already have `.env`, edit it directly. Otherwise create it:

Windows PowerShell:

```powershell
Copy-Item .env.example .env
notepad .env
```

macOS/Linux:

```sh
cp .env.example .env
nano .env
```

Use this format and replace the two placeholder values:

```dotenv
ALIEN_SITE_BASE=https://thisaliendoesnotexist.app/
SLACK_BOT_TOKEN=YOUR_BOT_TOKEN
SLACK_APP_TOKEN=YOUR_APP_TOKEN
DATA_DIR=./data
MAX_PENDING_JOBS=8
USER_COOLDOWN_SECONDS=5
```

Use a plain URL, without Markdown brackets or a backslash before the colon. Each variable is on its own line. There are no trailing backslashes. On Windows, ensure the filename is `.env`, not `.env.txt`.

Check and start:

```sh
npm test
npm run doctor
npm run probe
npm run doctor -- --slack
npm start
```

`doctor` validates configuration, data access and Chromium. `probe` uses the live website to generate seed 42, run a real battle and save `data/alien-42.png`; it does not use Slack tokens. `doctor -- --slack` checks both Slack credentials and Socket Mode without posting messages. `npm start` keeps the bot running until stopped.

Invite it into your test channel with `/invite @Nullo`, then try these one at a time:

```text
/nullo-ping
/nullo-ping site
/nullo 42
/nullo random
/nullo raw
/nullo-duel 42
/nullo-duel 42 98765
/nullo-pick pizza | noodles | tacos
/nullo-decide pizza | noodles
/nullo mine
```

Allow five seconds between browser requests. Click **Keep + make active** on a card, then run `/nullo-duel` to use that alien. `/nullo mine 2` opens the next collection page. `/nullo active 42` switches to a seed you have kept. Anyone can keep a shared alien; the original requester controls that card's Fight random and Another alien buttons.

## Images in chat

Alien cards and battle results display PNG portraits in the channel. The bot exports the website’s rendered canvas, uploads the PNG to Slack, then embeds the Slack file in the card. The uploaded original is also available in the message thread. Images are snapshots; animation stays on the website.

After replacing the files, stop the old process with Ctrl+C and run `npm start` again. Existing Slack messages do not change; issue a new command. No additional slash command registration is required for the new image check:

```text
/nullo-ping image
```

This generates seed 42 and tests rendering, uploading, and embedding in the current channel. Success reports `1 rendered, 1 uploaded, 1 embedded in chat`. Failures report the stage, error and suggested action privately to the requester.

If the error is `missing_scope`, open the Slack app’s OAuth & Permissions page, add **files:write under Bot Token Scopes**, then **reinstall the app to the workspace**. Restart the bot, updating the local bot token only if Slack issued a different one. Invite Nullo to the channel. Neither Nest hosting nor a public image domain is needed for this upload path.

For a render failure, run `npm run probe` locally and open `data/alien-42.png`. If Chromium is absent, run `npm run setup`. If the PNG is good but uploading fails, the diagnostic identifies the Slack error. If uploading succeeds but embedding fails, look in the card’s thread for the uploaded file. The bot retries temporary inline-image rejection without uploading the same file again.

## 4. Commit and push

This package ignores real environment files, dependencies, SQLite databases, cache files, logs and private keys. Example environment files are safe to commit. `.gitignore` does not remove files that Git already tracks.

If your old starter tracked `.env`, stop tracking it while keeping the local copy:

```sh
git rm --cached --ignore-unmatch .env
```

This does not erase a token from earlier commits. Rotate any token that was committed. If sensitive files other than `.env` were tracked, remove those specific paths from the index too.

Stage the actual project files explicitly:

```sh
git add .gitignore .gitattributes .nvmrc .env.example package.json package-lock.json app.mjs src scripts deploy test slack-app-manifest.json README.md
git diff --cached --name-only
git status --short
```

The staged list should contain code, documentation, the manifest, lockfile and example configuration. It must not contain `.env`, `node_modules`, `data`, or any file containing a real token. If you intentionally deleted old starter files, stage those specific deletions as well.

Use this commit message:

```sh
git commit -m "Build Nullo Slack bot with alien battles and Nest deployment"
git push
```

You can use the same message in GitHub Desktop. If this repository has no GitHub remote yet, create an **empty** GitHub repository named `nullo`, then connect it and push:

```sh
git remote add origin https://github.com/YOUR_USERNAME/nullo.git
git push -u origin HEAD
```

Use your existing default branch. No new feature branch is needed. Replace `YOUR_USERNAME` with your GitHub username.

## 5. Apply for Nest

The current Nest quickstart sends applicants to https://dashboard.hackclub.app. Start there if the older https://nest.hackclub.com/application link does not work. Sign in with Hack Club Auth and complete any required verification. Choose a username, provide your **public** SSH key, and describe the project.

First check for an existing key. In Windows PowerShell:

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
```

On macOS/Linux:

```sh
cat ~/.ssh/id_ed25519.pub
```

If that file is absent, check `id_rsa.pub` in the same directory. If neither exists, create a key using `ssh-keygen -t ed25519`, then display the `.pub` file again. Do not overwrite an existing private key. Paste the complete public key line into the application; never upload the matching private key.

Suggested project description:

> I am building Nullo, a Slack bot for my project This Alien Does Not Exist. It runs Node.js and a headless Chromium browser to use my deployed website's generation and battle API. Users can discover and collect aliens, fight random opponents, and settle channel decisions through battles or random picks. I need a continuously running process for Slack Socket Mode and a small persistent SQLite database. It is for the Stardance Slack bot mission.

After approval, use the SSH login shown by your dashboard. The quickstart's standard form is:

```sh
ssh YOUR_NEST_USERNAME@hackclub.app
```

The deployment below follows the mission's root-container setup. Check `whoami`; it should print `root` inside that container. If your account uses a different arrangement, follow its dashboard instructions before running system-level installation commands.

## 6. Deploy to Nest

Run these **on Nest**, after connecting by SSH. Install Node 24 explicitly so a future change to the default LTS does not change your runtime:

```sh
apt update
apt install -y git curl ca-certificates nano
curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nullo-nodesource.sh
bash /tmp/nullo-nodesource.sh
apt install -y nodejs
node --version
```

Clone your bot's repository and run the included installer:

```sh
git clone https://github.com/YOUR_USERNAME/nullo.git /opt/nullo
cd /opt/nullo
bash deploy/install-nest.sh
```

For a private repository, authenticate Git using SSH or GitHub's supported credential flow; do not put a GitHub token inside the clone URL. The installer creates an unprivileged `nullo` service account, installs dependencies and Chromium, prepares persistent storage and installs the service. It does not start a bot with placeholder tokens.

Create the server's environment by editing the file prepared by the installer:

```sh
nano /etc/nullo/bot.env
```

Replace its two token placeholders. Keep the other settings from `deploy/bot.env.example`, especially:

```dotenv
DATA_DIR=/var/lib/nullo
PLAYWRIGHT_BROWSERS_PATH=/opt/nullo-browsers
```

Save in nano with Ctrl+O, Enter, then Ctrl+X. Keep the file private:

```sh
chmod 600 /etc/nullo/bot.env
```

Test the website under the actual service user:

```sh
runuser -u nullo -- env PLAYWRIGHT_BROWSERS_PATH=/opt/nullo-browsers DATA_DIR=/var/lib/nullo /usr/bin/node /opt/nullo/scripts/probe.mjs
```

Stop the laptop copy with Ctrl+C, then start the persistent service:

```sh
systemctl enable --now nullo.service
systemctl status nullo.service --no-pager
journalctl -u nullo.service -n 50 --no-pager
```

Try `/nullo-ping`, `/nullo 42`, `/nullo-duel 42`, and `/nullo-pick yes | no` in Slack. Disconnect SSH and try again. `systemd` starts the bot on boot and restarts it if the process exits. Nest must remain running for the bot to stay online. A separate uptime-ping service is unnecessary.

Keep one active bot process for this deployment. Running laptop and Nest copies together distributes Socket Mode traffic between them and gives them different local collections.

## 7. Where the secrets live

| Location | What belongs there |
| --- | --- |
| Your computer's `.env` | Tokens for local development; ignored by Git |
| Nest's `/etc/nullo/bot.env` | Runtime tokens and server configuration; mode 600, read by systemd |
| GitHub repository | Source files, lockfile, manifest and placeholder examples |
| GitHub Actions secrets | Only credentials consumed by a future automated deployment workflow |

Your tokens reach Nest when you paste them into `/etc/nullo/bot.env` through SSH. You do not upload a real `.env` to GitHub. GitHub's **Settings → Secrets and variables → Actions** does not automatically send secrets to Nest. This manual deployment does not require Actions secrets.

When replacing tokens later, edit `/etc/nullo/bot.env` and run `systemctl restart nullo.service`. Do not paste secret values into shell commands, screenshots or Git commit messages.

## 8. Updates, backups and troubleshooting

After a new code commit has been pushed, update on Nest:

```sh
systemctl stop nullo.service
cd /opt/nullo
git pull --ff-only
bash deploy/install-nest.sh
systemctl start nullo.service
systemctl status nullo.service --no-pager
```

The installer preserves `/etc/nullo/bot.env` and `/var/lib/nullo`. It also refreshes the browser if the Playwright version changes. Collections and receipts are in `/var/lib/nullo/nullo.sqlite`. For a simple consistent backup, stop the service, copy `/var/lib/nullo` to your chosen private backup location, then start it again. Never commit that database.

| Symptom | What to check |
| --- | --- |
| `npm` is not recognized | Install Node 24 and reopen the terminal. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` in the same commands; no global execution-policy change is needed. |
| Chromium executable is missing | Run `npm run setup` locally; on Nest rerun the installer with its shared browser path. |
| Chromium says a shared library is missing | Run `npx playwright install --with-deps chromium` on Linux, or rerun the Nest installer. |
| Environment format error | Remove Markdown link syntax, backslashes and `.txt`; use the example file's format. |
| `invalid_auth`, `token_revoked`, `not_authed` | Replace the bot token from the correct Slack installation. |
| Socket Mode authentication fails | Check the app token, `connections:write`, Socket Mode, and that both tokens belong to the same app. |
| `missing_scope` | Add the three scopes from the manifest, then reinstall the app. |
| `not_in_channel` / no public card | Invite Nullo to the channel. |
| `dispatch_failed` | Start the process, check Socket Mode, and inspect the service logs. |
| Picker works but aliens fail | Run `npm run probe`; check browser installation and the live website. |
| Card works but no portrait | Check `files:write`, channel membership and the probe's PNG. The card retains its website link. |
| Collection appears to reset | Check `DATA_DIR` and stop other copies of the bot. |
| Command name belongs to another app | Change the command family in manifest and handlers, then reinstall. |

Use `journalctl -u nullo.service -f` for live logs. Ctrl+C stops log viewing, not the service. Use `systemctl restart nullo.service` to restart the bot.

## Behavior and scope

`random` draws ordinary aliens. `raw` draws one cryptographically random, unfiltered seed uniformly from 0 through 18,446,744,073,709,551,615. Explicit decimal seeds can be longer, subject to the website's own supported range; Nullo keeps them as strings to preserve precision.

Duels use the website's automatic combat simulation. Two explicit seeds can include special forms or the same alien; the website determines their outcome. A decision battle uses two distinct ordinary aliens, randomly assigns them to the two submitted options, and stores its encounter code before combat. A draw uses a stored random tiebreak. Battle outcomes are not guaranteed to give each option a 50/50 chance. `/nullo-pick` gives each distinct option one equal chance and supports 2–10 options.

Collections are scoped to Slack workspace and user. Multiple users can keep the same species. This version has automatic duels and website encounter links; it does not implement trading, exclusive ownership or turn-by-turn PvP inside Slack. Full website animation and manual combat remain on the website.

Slack requests are acknowledged before browser work. Browser jobs are serialized with a bounded queue. Duplicate deliveries are recorded in SQLite to avoid rerolling a decision. A process crash can interrupt a pending request; it is marked interrupted on restart rather than silently repeated. `/nullo receipt ID` retrieves your saved result. This does not claim exactly-once Slack message delivery across a process crash.

For the mission, demonstrate at least three functions, verify the names do not collide, and test from Slack with your laptop shut. Run and understand the code before submitting it as your project.

## Verification

The fifteen automated tests pass. They cover seed precision, duplicate options, battle ties, environment validation, persistent collections, duplicate deliveries, card permissions, image failure and the bounded queue. Image checks also cover delayed inline availability, missing upload permissions, partial battle portraits and direct PNG canvas export. The manifest's commands match the registered handlers. The dependency audit reported no vulnerabilities when this package was prepared.

The live website probe passed: seed 42 generated correctly, seed 98765 won the `nullo-live-check` encounter in 25 rounds, and the actual canvas was captured as a PNG. This check used Chromium 153 through a temporary test launcher because this build environment blocked the standard Playwright browser download. That launcher is not part of the package; your normal installation uses `npm run setup` and the pinned Playwright version. No Slack tokens were used in verification. Real Slack authentication, workspace permissions and Nest installation still require the setup checks above.

## References

- [Stardance mission requirements](https://stardance.hackclub.com/missions/slack-bot)
- [Stardance deployment guide](https://stardance.hackclub.com/missions/slack-bot/guide)
- [Nest quickstart](https://guides.hackclub.app/index.php/Quickstart)
- [Slack Socket Mode](https://docs.slack.dev/tools/bolt-js/concepts/socket-mode/)
- [Slack app manifests](https://docs.slack.dev/reference/app-manifest/)
- [Slack file uploads](https://docs.slack.dev/tools/node-slack-sdk/web-api/)
- [Playwright browser installation](https://playwright.dev/docs/browsers)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
