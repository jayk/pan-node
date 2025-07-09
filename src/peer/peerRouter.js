/**
 * peerRouter.js
 *
 * Handles node ID assignment and persistence for a PAN node.
 *
 * - On startup, loads or generates a node ID.
 * - Optionally persists the ID to disk to ensure stability across restarts.
 * - Allows updates to the node ID under specific conditions.
 * - Includes placeholders for future routing and handshake logic.
 */

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

/**
 * Persists the current node ID to the configured file path.
 * Ensures the ID is a valid UUID before writing.
 */
function persistNodeId() {
  if (!nodeId || !isUuid(nodeId) || !persistPath) {
    return;
  }

  try {
    fs.writeFileSync(persistPath, nodeId, 'utf8');
    log.info(`[peerRouter] Node ID persisted to ${persistPath}`);
  } catch (err) {
    log.error(`[peerRouter] Failed to persist node ID to ${persistPath}:`, err);
  }
}

/**
 * Initializes the peer router subsystem.
 * Loads or generates the node ID and returns API functions.
 *
 * @param {object} config - Configuration options for persistence and ID generation.
 * @returns {object} API functions (getNodeId, maybeChangeNodeId, shutdown, etc.)
 */
async function initialize(config = {}) {
  persistPath = path.resolve(config.persist_path || 'persisted_node_id.txt');

  const crashOnCorrupt = config.crash_on_corrupt === true;

  // Attempt to load persisted node ID from disk
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

  // Generate a node ID if none was loaded
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

  // If generated, persist it
  if (didGenerate && persistPath) {
    persistNodeId();
  }

  setNodeId(nodeId);

  return {
    /**
     * Returns the current node ID.
     */
    getNodeId: () => nodeId,

    /**
     * Placeholder for future peer handshake logic.
     *
     * @param {object} peerInfo - Information from a peer's hello message.
     */
    handlePeerHello: (peerInfo) => {
      // Future: handshake validation, etc.
    },

    /**
     * Placeholder for future routing table update handling.
     *
     * @param {string} peerId
     * @param {object} routingInfo
     */
    updateRoutingTable: (peerId, routingInfo) => {
      // Future: routing update handling
    },

    /**
     * Replaces the current node ID with a new one, if valid.
     * Also updates the persisted ID on disk.
     *
     * @param {string} newId
     */
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

    /**
     * Persists node ID on shutdown if valid.
     */
    shutdown: async () => {
      if (isUuid(nodeId)) {
        persistNodeId();
      }

      log.info('[peerRouter] Shutdown complete');
    }
  };
}

module.exports = { initialize };
