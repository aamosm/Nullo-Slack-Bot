# Nullo

A Slack bot for [This Alien Does Not Exist](https://thisaliendoesnotexist.app/). Discover aliens, keep your favourites, battle other aliens, and settle channel decisions.

## Use Nullo

Nullo is already hosted on Hack Club Nest and runs independently of the project owner's computer. **You do not need to install or host anything yourself.**

1. Join the Slack workspace where Nullo is installed.
2. In the channel where you want to use it, run `/invite @Nullo`.
3. Use the commands below.

> **Access note:** The hosted bot is connected to one Slack workspace. Being able to view this GitHub repository does not automatically give you access to the bot from your own workspace. You need to join the workspace where it is installed. Supporting other workspaces requires a separate app installation and multi-workspace setup.

## Commands

| Command | What it does | Example |
| --- | --- | --- |
| `/nullo` | Generate a random alien | `/nullo` |
| `/nullo SEED` | Generate an alien from a specific seed | `/nullo 42` |
| `/nullo raw` | Generate from the full raw seed range | `/nullo raw` |
| `/nullo mine` | View your saved aliens | `/nullo mine` |
| `/nullo active SEED` | Choose your active alien | `/nullo active 42` |
| `/nullo-duel` | Fight a random opponent | `/nullo-duel` |
| `/nullo-duel SEED SEED` | Fight using two specific aliens | `/nullo-duel 42 98765` |
| `/nullo-pick A \| B \| C` | Pick fairly between options | `/nullo-pick pizza \| noodles \| tacos` |
| `/nullo-decide A \| B` | Let two options' aliens battle | `/nullo-decide pizza \| noodles` |
| `/nullo-ping` | Check the bot | `/nullo-ping` |

Alien cards include portraits directly in Slack. Use **Keep + make active** on a card to save an alien and select it. Use `/nullo mine 2` to view the next page of your collection.

## About

Nullo uses the public generation and combat API from [This Alien Does Not Exist](https://thisaliendoesnotexist.app/). Its hosted bot uses Slack Socket Mode and runs as a managed service on Hack Club Nest. Portraits are generated from the website's canvas and uploaded to Slack.

This repository contains the bot's source code. Running your own copy requires your own Slack app, tokens, and server setup; it is not needed to use the hosted instance.
