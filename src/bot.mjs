import { UserError, JobQueue, seedOf, randomSeed, encounterCode, optionsOf, pick, coin, decisionResult, alienURL, shortSeed, escapeSlack } from './domain.mjs';
import { alienView, battleView, help } from './views.mjs';
import { deliverPortraits, imageReport, safeError } from './images.mjs';
export { safeError } from './images.mjs';

export function installHandlers(app, { config, store, website, logger = console }) {
  const jobs = new JobQueue(config.maxPending);
  const cooldowns = new Map();
  let schema;
  const getSchema = async () => schema ||= await website.request({ op: 'schema' });
  const privateReply = (respond, text) => respond({ response_type: 'ephemeral', text, replace_original: false });
  const post = (client, channel, view) => client.chat.postMessage({ channel, ...view, unfurl_links: false, unfurl_media: false });

  async function generate(seed) {
    const record = await website.request({ op: 'generate', seed, options: { generatorVersion: 2 } });
    if (record?.identity?.seed !== seed || !record.combat || !Array.isArray(record.combat.abilities)) throw new Error('Website API format changed.');
    return record;
  }

  async function ordinary(exclude) {
    for (let n = 0; n < 16; n++) {
      const seed = randomSeed();
      if (seed === exclude) continue;
      const record = await generate(seed);
      if (record.kind === 'alien' && !record.combat.absolute) return record;
    }
    throw new Error('Could not draw an ordinary alien.');
  }

  async function discover(ctx, argument = 'random') {
    const record = argument === 'random' ? await ordinary() : await generate(argument === 'raw' ? randomSeed() : seedOf(argument));
    const mode = argument === 'raw' ? 'Unfiltered 64-bit random seed' : argument === 'random' ? 'Random ordinary alien' : 'Exact seed';
    const view = alienView(record, await getSchema(), config.baseURL, ctx.id, mode);
    const payload = { seed: record.identity.seed, mode: argument === 'raw' ? 'raw' : 'random', text: `${view.text}\n${alienURL(config.baseURL, record.identity.seed)}` };
    store.save(ctx.id, payload);
    const message = await post(ctx.client, ctx.channel, view);
    const images = await deliverPortraits({ website, client: ctx.client, channel: ctx.channel, ts: message.ts, view, logger,
      portraits: [{ seed: record.identity.seed, label: `Alien ${shortSeed(record.identity.seed)} · ${record.phenotype || record.kind}` }],
    });
    store.save(ctx.id, { ...payload, images });
    if (!images.ok || ctx.imageCheck) await privateReply(ctx.respond, escapeSlack(imageReport(images)));
  }

  async function duel(ctx, args = [], labels) {
    let left, right;
    if (labels) {
      left = await ordinary();
      right = await ordinary(left.identity.seed);
      if (coin()) [left, right] = [right, left];
    } else {
      const active = store.active(ctx.team, ctx.user);
      left = args[0] ? await generate(seedOf(args[0])) : active ? await generate(active) : await ordinary();
      right = args[1] ? await generate(seedOf(args[1])) : await ordinary(left.identity.seed);
    }
    const code = encounterCode();
    const tieIndex = coin();
    const setup = { seeds: [left.identity.seed, right.identity.seed], encounter: code, labels, tieIndex };
    store.save(ctx.id, setup, 'pending');
    if (labels) await post(ctx.client, ctx.channel, {
      text: 'Nullo is running a decision battle.',
      blocks: [{ type: 'section', text: { type: 'plain_text', text: `Choices locked\n${labels[0]} → ${shortSeed(left.identity.seed)}\n${labels[1]} → ${shortSeed(right.identity.seed)}\nEncounter: ${code}\nA draw uses one saved random tiebreak. Receipt: ${ctx.id}` } }],
    });
    const battle = await website.request({ op: 'duel', left: left.identity.seed, right: right.identity.seed, options: { leftVersion: 2, rightVersion: 2, battleSeed: code, terrain: 'random', time: 'random' } });
    const result = decisionResult(battle, tieIndex);
    const view = battleView(battle, config.baseURL, ctx.id, labels, result);
    store.save(ctx.id, { ...setup, text: `${view.text}\n${view.blocks[2].text.text}`, battle, decision: labels ? result : undefined });
    const message = await post(ctx.client, ctx.channel, view);
    const images = await deliverPortraits({ website, client: ctx.client, channel: ctx.channel, ts: message.ts, view, logger,
      portraits: setup.seeds.map((seed, i) => ({ seed, label: `${labels?.[i] || `Fighter ${i + 1}`} · seed ${shortSeed(seed)}` })),
    });
    if (!images.ok) await privateReply(ctx.respond, escapeSlack(imageReport(images)));
  }

  async function execute(ctx, work, heavy = true) {
    const id = store.claim(ctx.delivery, ctx.team, ctx.user, ctx.kind);
    if (!id) return;
    ctx.id = id;
    try {
      if (heavy) {
        const key = `${ctx.team}:${ctx.user}`;
        if (Date.now() < (cooldowns.get(key) || 0)) throw new UserError('Give Nullo a few seconds between requests.');
        cooldowns.set(key, Date.now() + config.cooldownMs);
        for (const [k, expiry] of cooldowns) if (expiry < Date.now()) cooldowns.delete(k);
        await jobs.run(() => work(ctx));
      } else await work(ctx);
    } catch (error) {
      const saved = store.get(id, ctx.team);
      if (saved?.state !== 'complete') store.save(id, { ...saved?.payload, text: error instanceof UserError ? error.message : 'Request could not finish. The saved encounter, if any, was not rerolled.' }, 'failed');
      logger.error(`Request ${id}: ${safeError(error)}`);
      const message = error instanceof UserError ? error.message : error?.data?.error === 'not_in_channel' ? 'Invite Nullo to this channel with /invite @Nullo, then try again.' : `Nullo could not finish that request. Check /nullo-ping site and the service logs. Receipt: ${id}`;
      await privateReply(ctx.respond, message).catch(e => logger.error(safeError(e)));
    }
  }

  function register(name, route) {
    app.command(name, async ({ ack, command, client, respond }) => {
      await ack();
      const ctx = { client, respond, channel: command.channel_id, team: command.team_id, user: command.user_id, kind: name, delivery: `${command.team_id}:slash:${command.trigger_id}` };
      try { await route(ctx, command.text.trim()); }
      catch (error) { await privateReply(respond, error instanceof UserError ? error.message : 'That request failed. Check the Nullo service logs.'); logger.error(safeError(error)); }
    });
  }

  register('/nullo', async (ctx, text) => {
    const [verb, ...args] = text.split(/\s+/);
    if (!verb || verb === 'help') return privateReply(ctx.respond, help);
    if (verb === 'mine') {
      const page = Number(args[0] || 1);
      if (args.length > 1 || !Number.isSafeInteger(page) || page < 1) throw new UserError('Use /nullo mine or /nullo mine 2.');
      const collection = store.collection(ctx.team, ctx.user, page);
      return privateReply(ctx.respond, collection.count ? `*Your aliens · page ${page} of ${Math.ceil(collection.count / 10)}*\n${collection.rows.map(({ seed }) => `<${alienURL(config.baseURL, seed)}|${shortSeed(seed)}>${seed === collection.active ? ' · active' : ''}`).join('\n')}\nUse /nullo active SEED to choose your fighter.` : 'Your collection is empty. Generate an alien and press Keep + make active.');
    }
    if (verb === 'active') {
      if (args.length !== 1) throw new UserError('Use /nullo active SEED with an alien you have kept.');
      const seed = seedOf(args[0]);
      if (!store.owns(ctx.team, ctx.user, seed)) throw new UserError('Keep this alien first with the button on its card.');
      store.keep(ctx.team, ctx.user, seed);
      return privateReply(ctx.respond, `Active fighter: ${shortSeed(seed)}`);
    }
    if (verb === 'receipt') {
      const job = store.get(args[0] || '', ctx.team);
      if (args.length !== 1 || !job || job.owner !== ctx.user) throw new UserError('No receipt found for your account.');
      return privateReply(ctx.respond, `${job.state}: ${escapeSlack(job.payload?.text || 'The request was interrupted. No result was published.')}\n${job.payload?.encounter ? `Encounter: ${job.payload.encounter}\nSeeds: ${job.payload.seeds.map(shortSeed).join(' vs ')}` : ''}`);
    }
    if (args.length) throw new UserError('Use /nullo help for the command list.');
    if (!['random', 'raw'].includes(verb)) seedOf(verb);
    return execute(ctx, c => discover(c, verb));
  });

  register('/nullo-duel', (ctx, text) => {
    const args = text ? text.split(/\s+/) : [];
    if (args.length > 2) throw new UserError('Use /nullo-duel, /nullo-duel 42, or /nullo-duel 42 98765.');
    args.forEach(seedOf);
    return execute(ctx, c => duel(c, args));
  });

  register('/nullo-pick', (ctx, text) => {
    const choices = optionsOf(text);
    return execute(ctx, async c => {
      const selected = pick(choices);
      const result = `Picked: ${choices[selected]}\nEach of the ${choices.length} distinct choices had an equal chance.`;
      store.save(c.id, { choices, selected, text: result });
      await post(c.client, c.channel, { text: escapeSlack(result), blocks: [
        { type: 'section', text: { type: 'plain_text', text: result } },
        { type: 'context', elements: [{ type: 'plain_text', text: `Options: ${choices.join(' | ')}\nReceipt: ${c.id}` }] },
      ] });
    }, false);
  });

  register('/nullo-decide', (ctx, text) => {
    const choices = optionsOf(text, true);
    return execute(ctx, c => duel(c, [], choices));
  });

  register('/nullo-ping', async (ctx, text) => {
    if (text && !['site', 'image'].includes(text)) throw new UserError('Use /nullo-ping, /nullo-ping site, or /nullo-ping image.');
    if (text === 'image') return execute(ctx, c => discover({ ...c, imageCheck: true }, '42'));
    if (text === 'site') return execute(ctx, async c => {
      const started = Date.now();
      await website.request({ op: 'schema' });
      await privateReply(c.respond, `Pong. Live website API works (${Date.now() - started} ms).`);
      store.save(c.id, { text: 'Website API check passed.' });
    });
    return privateReply(ctx.respond, `Pong. Slack connected. Uptime: ${Math.floor(process.uptime())}s.\nBrowser jobs: ${jobs.pending}. Last successful website API call: ${website.lastOK || 'not checked yet'}.\nUse /nullo-ping site for a live website check.`);
  });

  app.action(/^nullo_(open|view_[01]|encounter)$/, async ({ ack }) => { await ack(); });
  app.action(/^nullo_(keep|fight|another)$/, async ({ ack, body, action, client, respond }) => {
    await ack();
    const team = body.team?.id;
    const user = body.user.id;
    const job = store.get(action.value, team);
    if (!job?.payload?.seed) return privateReply(respond, 'This alien card is no longer available. Generate it again by seed.');
    if (action.action_id === 'nullo_keep') {
      store.keep(team, user, job.payload.seed);
      return privateReply(respond, `Kept alien ${shortSeed(job.payload.seed)} and made it your active fighter.`);
    }
    if (job.owner !== user) return privateReply(respond, 'You can Keep this alien. Generate your own card to use Fight random or Another alien.');
    const ctx = { team, user, channel: body.channel.id, client, respond, kind: action.action_id, delivery: `${team}:action:${body.channel.id}:${body.message.ts}:${action.action_id}:${action.action_ts}` };
    return execute(ctx, c => action.action_id === 'nullo_fight' ? duel(c, [job.payload.seed]) : discover(c, job.payload.mode));
  });
  return { drain: () => jobs.drain() };
}

