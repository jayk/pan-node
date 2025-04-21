// node/client/clientRegistry.js

const panApp = require('../panApp');
const crypto = require('crypto');

async function initialize(config = {}) {
  const clients = new Map();   // connId → panConnection
  const sessions = new Map();  // connId → authKey

  const registerClient = (conn) => {
    const { id: connId, name } = conn;
    const authKey = crypto.randomUUID();
    conn.authKey = authKey;

    clients.set(connId, conn);
    sessions.set(connId, authKey);

    return authKey;
  };

  const unregisterClient = (connId) => {
    clients.delete(connId);
    sessions.delete(connId);
  };

  const getClient = (connId) => {
    return clients.get(connId);
  };

  const resumeClient = (connId, authKey) => {
    const expected = sessions.get(connId);
    const client = clients.get(connId);
    if (expected && expected === authKey && client) {
      return client;
    }
    return null;
  };

  const getClientCount = () => clients.size;

  return {
    registerClient,
    unregisterClient,
    getClient,
    resumeClient,
    getClientCount,
    shutdown: async () => {
      clients.clear();
      sessions.clear();
    }
  };
}

module.exports = { initialize };
