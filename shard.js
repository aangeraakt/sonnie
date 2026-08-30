require('dotenv').config();
const { ShardingManager } = require('discord.js');
const path = require('path');
const Logger = require('./utils/logger');

/**
 * Sharded entry point. Discord requires sharding past 2,500 guilds; below
 * that `npm start` (plain index.js) is simpler and uses less memory.
 *
 *   npm run shard              auto-detects the shard count
 *   SONNIES_SHARD_COUNT=4 npm run shard   pins it
 *
 * Note: each shard is a separate process with its own copy of the JSON store
 * in memory. Two shards never hold the same guild, so guild-scoped data is
 * safe, but anything genuinely global would need a real database first.
 */
const token = process.env.DISCORD_TOKEN || '';
if (!token || token === 'your_bot_token_here') {
  Logger.error('DISCORD_TOKEN is missing or default in .env file!');
  process.exit(1);
}

// Deliberately not called SHARD_COUNT: discord.js reads that variable itself
// when a Client starts, and a non-numeric value there breaks plain startup.
const configured = process.env.SONNIES_SHARD_COUNT;
const totalShards = configured && configured !== 'auto' ? Number(configured) : 'auto';

const manager = new ShardingManager(path.join(__dirname, 'index.js'), {
  token,
  totalShards,
  respawn: true
});

manager.on('shardCreate', (shard) => {
  Logger.success(`Launched shard #${shard.id}`);

  shard.on('death', (process) => {
    Logger.error(`Shard #${shard.id} died (exit code ${process.exitCode}). Respawning.`);
  });

  shard.on('ready', () => {
    Logger.info(`Shard #${shard.id} is ready.`);
  });

  shard.on('disconnect', () => {
    Logger.warn(`Shard #${shard.id} disconnected.`);
  });

  shard.on('reconnecting', () => {
    Logger.warn(`Shard #${shard.id} is reconnecting.`);
  });
});

manager.spawn({ timeout: 120000 })
  .then((shards) => {
    Logger.success(`All ${shards.size} shard(s) spawned.`);
  })
  .catch((err) => {
    Logger.error('Failed to spawn shards:', err);
    process.exit(1);
  });

/** Totals a value across every shard, for /utility botinfo. */
async function aggregate(evaluator) {
  const results = await manager.broadcastEval(evaluator);
  return results.reduce((sum, value) => sum + value, 0);
}

module.exports = { manager, aggregate };
