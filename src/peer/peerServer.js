// node/peer/peerServer.js

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { peerConnection } = require('./peerConnection');
const { log } = require('../utils/log');
const panApp = require('../panApp');

const DEFAULT_PEER_PORT = 5874;

async function initialize(config = {}) {
  const port = config.port || DEFAULT_PEER_PORT;
  const wss = new WebSocket.Server({ port });
  const peerRegistry = panApp.use('peerRegistry');

  log.info(`[peer] Peer WebSocket server listening on port ${port}`);

  wss.on('connection', (ws) => {
    log.info('[peer] Incoming peer connection...');

    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch (err) {
        log.warn('[peer] Invalid JSON from peer:', data.toString());
        ws.close();
        return;
      }

      // Expect first message to be peer_control:hello
      if (msg.type !== 'peer_control' || msg.msg_type !== 'hello') {
        log.warn('[peer] Invalid initial peer handshake');
        ws.close();
        return;
      }

      const { node_id, jwt: nodeJwt } = msg.payload || {};
      if (!node_id || !nodeJwt) {
        log.warn('[peer] Missing node_id or jwt in handshake');
        ws.close();
        return;
      }

      const secret = pan.peerRegistry.getSecretForNode(node_id);
      if (!secret) {
        log.warn(`[peer] No shared secret for node ${node_id}`);
        ws.close();
        return;
      }

      try {
        jwt.verify(nodeJwt, secret, { audience: 'pan-peer' });
      } catch (err) {
        log.warn(`[peer] Invalid JWT for node ${node_id}:`, err.message);
        ws.close();
        return;
      }

      const peer = new PeerConnection(ws, node_id);
      pan.peerRegistry.registerPeer(node_id, peer);
      log.info(`[peer] Registered peer: ${node_id}`);
    });
  });

  return {
    shutdown: async () => {
      log.info('[peer] Shutting down peer WebSocket server...');
      return new Promise((resolve, reject) => {
        wss.close((err) => {
          if (err) {
            log.error('[peer] Error shutting down peer server:', err);
            reject(err);
          } else {
            log.info('[peer] Peer server closed');
            resolve();
          }
        });
      });
    },
    getStatus: () => ({
      port,
      connectedPeers: pan.peerRegistry.getPeerCount?.() || 0
    })
  };
}

module.exports = { initialize };
