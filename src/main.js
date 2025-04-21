// main.js

const fs = require('fs');
const path = require('path');
const JSON5 = require('json5');
const { initializeLogger, getLogger, log } = require('./utils/log');
const panApp = require('./panApp');

const nodeMessages = require('./utils/nodeMessages');
const peerServer = require('./peer/peerServer');
const peerRouter = require('./peer/peerRouter');
const clientRouter = require('./client/clientRouter');
const clientServer = require('./client/clientServer');
const groupManager = require('./client/groupManager');
const clientRegistry = require('./client/clientRegistry');

function loadConfig() {
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

async function main() {
  log.info('🧠 Starting PAN Node...');

  const config = loadConfig();

  log.info('🖹  Initializing Logging...');
  initializeLogger(config.logging);

  // Start peerRouter FIRST — it determines and registers the node ID
  log.info('⤱  Initializing peer router...');
  panApp.setSubsystem('peerRouter', await peerRouter.initialize(config.peer_router));

  log.info('🌐 Initializing peer server...');
  panApp.setSubsystem('peerServer', await peerServer.initialize(config.peer_server));
  log.info('✅ Peer server ready');


  log.info('⚙️  Initializing client router...');
  panApp.setSubsystem('clientRouter', await clientRouter.initialize(config.client_router || {}));

  log.info('🔧 Initializing group manager...');
  panApp.setSubsystem('groupManager', await groupManager.initialize(config.group_manager));

  
  log.info('🔧 Initializing client registry...');
  panApp.setSubsystem('clientRegistry', await clientRegistry.initialize(config.client_registry));

  log.info('🌐 Initializing client server...');
  panApp.setSubsystem('clientServer', await clientServer.initialize(config.client_server));
  log.info('✅ Client server ready');

  log.info('🎉 PAN Node fully online');

  global.PAN = panApp;
}

main().catch(err => {
  log.error('❌ PAN Node startup failed:', err);
  process.exit(1);
});
