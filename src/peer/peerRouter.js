// node/peer/peerRouter.js

const { v4: uuidv4, v5: uuidv5, validate: isUuid } = require('uuid');
const fs = require('fs');
const path = require('path');
const panApp = require('../panApp');
const peerStatus = require('./peerStatus');
const { log } = require('../utils/log');

const PAN_ROOT_ID = "219dd24f-63c4-5e35-b886-da1b21ecc0e0";
const setNodeId = peerStatus.getNodeIdSetter();

let nodeId = null;
let persistPath = null;
let didGenerate = false;

function persistNodeId() {
  if (!nodeId || !isUuid(nodeId) || !persistPath) return;
  try {
    fs.writeFileSync(persistPath, nodeId, 'utf8');
    log.info(`[peerRouter] Node ID persisted to ${persistPath}`);
  } catch (err) {
    log.error(`[peerRouter] Failed to persist node ID to ${persistPath}:`, err);
  }
}

async function initialize(config = {}) {
  persistPath = path.resolve(config.persist_path || 'persisted_node_id.txt');
  const crashOnCorrupt = config.crash_on_corrupt === true;

  if (persistPath && fs.existsSync(persistPath)) {
    try {
      const persisted = fs.readFileSync(persistPath, 'utf8').trim();
      if (isUuid(persisted)) {
        nodeId = persisted;
        log.info(`[peerRouter] Loaded persisted node ID: ${nodeId}`);
      } else {
        const msg = `[peerRouter] Invalid node ID in persist file at ${persistPath}`;
        if (crashOnCorrupt) {
          log.error(`${msg} — refusing to start.`);
          process.exit(1);
        } else {
          log.warn(`${msg}, regenerating.`);
        }
      }
    } catch (err) {
      if (crashOnCorrupt) {
        log.error(`[peerRouter] Failed to read persist file at ${persistPath}, refusing to start.`, err);
        process.exit(1);
      } else {
        log.warn(`[peerRouter] Could not read persist file, regenerating node ID.`, err);
      }
    }
  }

  if (!nodeId) {
    if (config.node_identifier) {
      nodeId = uuidv5(config.node_identifier, PAN_ROOT_ID);
      log.info(`[peerRouter] Generated node ID from identifier: ${nodeId}`);
    } else {
      nodeId = uuidv4();
      didGenerate = true;
      log.warn(`[peerRouter] No identifier provided. Generated random node ID: ${nodeId}`);
    }
  }

  if (didGenerate && persistPath) persistNodeId();

  setNodeId(nodeId);

  return {
    getNodeId: () => nodeId,

    handlePeerHello: (peerInfo) => {
      // Future: handshake validation, etc.
    },

    updateRoutingTable: (peerId, routingInfo) => {
      // Future: routing update handling
    },

    maybeChangeNodeId: (newId) => {
      if (isUuid(newId)) {
        nodeId = newId;
        panApp.setSubsystem('nodeId', newId);
        persistNodeId();
        log.warn(`[peerRouter] Node ID changed to: ${newId}`);
      } else {
        log.error(`[peerRouter] Attempted to set invalid node ID: ${newId}`);
      }
    },

    shutdown: async () => {
      if (isUuid(nodeId)) persistNodeId();
      log.info('[peerRouter] Shutdown complete');
    }
  };
}

module.exports = { initialize };

