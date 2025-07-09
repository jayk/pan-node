/**
 * agentRegistry.js
 *
 * Tracks connected agent connections and their session auth keys.
 *
 * Each agent is identified by a connection ID and has an associated random
 * auth key to allow short-term resumption of a session. This is useful for
 * handling temporary disconnects or interruptions in agent connectivity.
 *
 * Exposes functions to register, unregister, resume, and look up agents,
 * as well as a shutdown method to clear the registry.
 */

const panApp = require('../panApp');
const crypto = require('crypto');

/**
 * Initializes the agent registry.
 *
 * @param {object} config - Optional configuration (unused here).
 * @returns {object} API for interacting with the registry.
 */
async function initialize(config = {}) {
  const agents = new Map();

  const sessions = new Map();

  /**
   * Registers a new agent connection.
   *
   * Assigns a random auth key and stores both the connection and key.
   *
   * @param {object} conn - The agent connection object (must include `id`).
   * @returns {string} authKey - A session key used for resuming the connection.
   */
  const registerAgent = (conn) => {
    const { id: connId, name } = conn;

    const authKey = crypto.randomUUID();

    conn.authKey = authKey;

    agents.set(connId, conn);

    sessions.set(connId, authKey);

    return authKey;
  };

  /**
   * Unregisters an agent connection by connection ID.
   *
   * @param {string} connId
   */
  const unregisterAgent = (connId) => {
    agents.delete(connId);
    sessions.delete(connId);
  };

  /**
   * Retrieves the registered agent connection by connection ID.
   *
   * @param {string} connId
   * @returns {object|undefined}
   */
  const getAgent = (connId) => {
    return agents.get(connId);
  };

  /**
   * Attempts to resume an agent session using its auth key.
   *
   * @param {string} connId
   * @param {string} authKey
   * @returns {object|null} - Agent connection or null if invalid.
   */
  const resumeAgent = (connId, authKey) => {
    const expected = sessions.get(connId);

    const agent = agents.get(connId);

    if (expected && expected === authKey && agent) {
      return agent;
    }

    return null;
  };

  /**
   * Returns the current number of connected agents.
   *
   * @returns {number}
   */
  const getAgentCount = () => agents.size;

  /**
   * Shuts down the registry and clears all state.
   */
  const shutdown = async () => {
    agents.clear();
    sessions.clear();
  };

  return {
    registerAgent,
    unregisterAgent,
    getAgent,
    resumeAgent,
    getAgentCount,
    shutdown
  };
}

module.exports = { initialize };
