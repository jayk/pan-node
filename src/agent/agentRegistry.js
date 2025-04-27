// node/agent/agentRegistry.js

const panApp = require('../panApp');
const crypto = require('crypto');

async function initialize(config = {}) {
  const agents = new Map();   // connId → panConnection
  const sessions = new Map();  // connId → authKey

  const registerAgent = (conn) => {
    const { id: connId, name } = conn;
    const authKey = crypto.randomUUID();
    conn.authKey = authKey;

    agents.set(connId, conn);
    sessions.set(connId, authKey);

    return authKey;
  };

  const unregisterAgent = (connId) => {
    agents.delete(connId);
    sessions.delete(connId);
  };

  const getAgent = (connId) => {
    return agents.get(connId);
  };

  const resumeAgent = (connId, authKey) => {
    const expected = sessions.get(connId);
    const agent = agents.get(connId);
    if (expected && expected === authKey && agent) {
      return agent;
    }
    return null;
  };

  const getAgentCount = () => agents.size;

  return {
    registerAgent,
    unregisterAgent,
    getAgent,
    resumeAgent,
    getAgentCount,
    shutdown: async () => {
      agents.clear();
      sessions.clear();
    }
  };
}

module.exports = { initialize };
