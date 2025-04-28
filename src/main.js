// main.js

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

// Load config from file if needed
function loadConfigFromDisk() {
  const configFile = process.env.PAN_CONFIG || 'config.json5';
  const configPath = path.resolve(__dirname, configFile);

  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON5.parse(raw);
    log.info(`✅ Loaded config from ${configPath}`);
    return parsed;
  } catch (err) {
    log.error(`❌ Failed to read config file at ${configPath}:`, err);
    process.exit(1);
  }
}

async function startNode(providedConfig = null) {
  if (nodeStarted) {
    log.warn('⚠️ PAN Node already started.');
    return;
  }

  const config = providedConfig || loadConfigFromDisk();

  log.info('🧠 Starting PAN Node...');

  initializeLogger(config.logging);

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

  global.PAN = panApp;

  log.info('🎉 PAN Node fully online');
  return panApp;
}

async function stopNode() {
  if (!nodeStarted) {
    log.warn('⚠️ PAN Node not running.');
    return;
  }

  log.info('🛑 Stopping PAN Node...');

  const shutdowns = [];

  const subsystems = [
    'peerServer',
    'agentServer',
    'peerRouter',
    'agentRouter',
    'groupManager',
    'agentRegistry'
  ];

  for (const name of subsystems) {
    const sub = panApp.use(name);
    if (sub && typeof sub.shutdown === 'function') {
      shutdowns.push(sub.shutdown().catch((err) => {
        log.error(`❌ Error shutting down ${name}:`, err);
      }));
    }
  }

  await Promise.all(shutdowns);

  nodeStarted = false;
  log.info('✅ PAN Node stopped.');
}

// If this script is being run directly, start the node with config file
if (require.main === module) {
  startNode().catch(err => {
    log.error('❌ PAN Node startup failed:', err);
    process.exit(1);
  });
}

// Expose functions for testing or external control
module.exports = {
  startNode,
  stopNode
};
