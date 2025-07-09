/**
 * main.js
 *
 * Entry point and lifecycle manager for a PAN Node instance.
 *
 * This module loads the configuration, initializes all subsystems (peer server,
 * agent server, routers, registries, auth managers, etc.), and provides start
 * and stop functions for the node.
 *
 * If run directly from the command line, it starts the node using the config file.
 * Also handles graceful shutdown on SIGTERM.
 */
const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const { initializeLogger, getLogger, log } = require('./utils/log');
const panApp = require('./panApp');

const nodeMessages = require('./utils/nodeMessages');
const peerServer = require('./peer/peerServer');
const peerRouter = require('./peer/peerRouter');
const agentRouter = require('./agent/agentRouter');
const agentServer = require('./agent/agentServer');
const groupManager = require('./agent/groupManager');
const peerRegistry = require('./peer/peerRegistry');
const agentRegistry = require('./agent/agentRegistry');
const specialAgentRegistry = require('./peer/specialAgentRegistry');
const agentAuthManager = require('./node/agentAuthManager');

let nodeStarted = false;

// Load config from disk using JSON5 (allows comments and trailing commas)
/**
 * Reads and parses the configuration file from disk.
 * Returns the config object or exits the process if parsing fails.
 */
function loadConfigFromDisk() {
  const configFile = process.env.PAN_CONFIG || 'config.json5';
  const configPath = path.resolve(__dirname, configFile);

  try {
    const raw = fs.readFileSync(configPath, 'utf-8'); // Read file as UTF-8 text
    const parsed = JSON5.parse(raw); // Parse JSON5 into JS object
    log.info(`✅ Loaded config from ${configPath}`);
    return parsed;
  } catch (err) {
    log.error(`❌ Failed to read config file at ${configPath}:`, err);
    process.exit(1); // Exit if reading/parsing fails
  }
}

/**
 * Starts the PAN node. Loads config, initializes all subsystems,
 * and sets up global PAN object.
 * 
 * @param {Object|null} providedConfig - Optionally override config from file.
 */
async function startNode(providedConfig = null) {
  if (nodeStarted) {
    log.warn('⚠️ PAN Node already started.');
    return;
  }

  const config = providedConfig || loadConfigFromDisk();

  log.info('🧠 Starting PAN Node...');

  initializeLogger(config.logging); // Initialize logging with config settings

  // Initialize each subsystem with its respective config section
  log.info('🔧 Initializing peer registry...');
  panApp.setSubsystem('peerRegistry', await peerRegistry.initialize(config.peer_registry || {}));

  log.info('🔧 Initializing special agent registry...');
  panApp.setSubsystem('specialAgentRegistry', await specialAgentRegistry.initialize(config.special_agent_registry || {}));

  log.info('🔧 Initializing agent registry...');
  panApp.setSubsystem('agentRegistry', await agentRegistry.initialize(config.agent_registry));

  log.info('⤱  Initializing peer router...');
  panApp.setSubsystem('peerRouter', await peerRouter.initialize(config.peer_router));

  log.info('🌐 Initializing peer server...');
  panApp.setSubsystem('peerServer', await peerServer.initialize(config.peer_server));
  log.info('✅ Peer server ready');

  log.info('🔒  Initializing agent auth manager...');
  panApp.setSubsystem('agentAuthManager', agentAuthManager.initialize(config.agent_auth_manager || {}));

  log.info('⚙  Initializing agent router...');
  panApp.setSubsystem('agentRouter', await agentRouter.initialize(config.agent_router || {}));

  log.info('🔧 Initializing group manager...');
  panApp.setSubsystem('groupManager', await groupManager.initialize(config.group_manager));

  log.info('🌐 Initializing agent server...');
  panApp.setSubsystem('agentServer', await agentServer.initialize(config.agent_server));
  log.info('✅ Agent server ready');

  nodeStarted = true;

  // Make PAN globally available
  global.PAN = panApp;

  log.info('⭕ PAN Node fully online');
  return panApp;
}

/**
 * Stops the PAN node and shuts down subsystems cleanly.
 */
async function stopNode() {
  if (!nodeStarted) {
    log.warn('⚠️ PAN Node not running.');
    return;
  }

  log.info('🛑 Stopping PAN Node...');

  const shutdowns = [];

  // List of subsystems that support shutdown
  const subsystems = [
    'peerServer',
    'agentServer',
    'peerRouter',
    'agentRouter',
    'groupManager',
    'agentRegistry'
  ];

  // Call shutdown on each subsystem that provides it
  for (const name of subsystems) {
    const sub = panApp.use(name);
    if (sub && typeof sub.shutdown === 'function') {
      log.info(`🚦 Stopping ${name}...`);
      shutdowns.push(sub.shutdown().catch((err) => {
        log.error(`❌ Error shutting down ${name}:`, err);
      }));
    }
  }

  await Promise.all(shutdowns); // Wait for all shutdowns to complete

  nodeStarted = false;
  log.info('⛔ PAN Node stopped.');
}

// If this file is run directly (not imported as module), start the node
if (require.main === module) {
  process.on('SIGTERM', function() {
    log.warn('⚠️  PAN Node shutting down...');
    stopNode().then(() => {
      log.info('❌ PAN Node shutdown complete');
    }).catch(e => {
      log.info('❌❌ PAN Node shutdown failed:', e);
    });
  });

  startNode().catch(err => {
    log.error('❌ PAN Node startup failed:', err);
    process.exit(1);
  });
}

// Expose control functions for testing or external use
module.exports = {
  startNode,
  stopNode
};
