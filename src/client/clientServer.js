// node/client/clientServer.js

const { createServer } = require('http');
const WebSocket = require('ws');
const jwt = require('../utils/jwt');
const uuid = require('uuid');
const { log } = require('../utils/log');
const { cleanupClient } = require('./clientControl');
const handleNodeMessage = require('../utils/nodeMessages');
const { createPanConnection, rawSendControl, rawSendError } = require('./panConnection');
const panApp = require('../panApp');

const DEFAULT_CLIENT_PORT = 5295;
const MAX_MESSAGE_BYTES = 61440; // 60KB safe limit for JSON messages
const cleanupTimeouts = new Map();
const { validateIncomingClientMessage } = require('../utils/validators');
const spamProtector = require('../utils/spamProtector');



function handleWebSocket(ws, req, config) {
  const spamConfig = config.spam_protection || {};
  const SPAM_WINDOW_SECONDS = spamConfig.window_seconds ?? 10;
  const SPAM_MESSAGE_LIMIT = spamConfig.message_limit ?? 50;
  const SPAM_DISCONNECT_THRESHOLD = spamConfig.disconnect_threshold ?? 5;
  const SPAM_ERROR_RESET_WINDOW = spamConfig.error_reset_window * 1000 ?? 300000;
  const MAX_ERRORS_BEFORE_DISCONNECT = spamConfig.disconnect_threshold ?? 5;

  ws.lastErrorTimestamp = Date.now();
  ws.msg_errors = 0;
  ws.conn_id = 'unknown';

  ws.on('message', async (msgBuffer) => {
    const now = Date.now();
    const spamResult = spamProtector.track(ws, spamConfig);
    if (spamResult.violation) {
      ws.spamViolations = (ws.spamViolations || 0) + 1;
      rawSendControl(ws, {
        msg_type: 'speed_limit_exceeded',
        payload: {
          limit: spamResult.limit,
          window: spamResult.window
        }
      });

      if (ws.spamViolations >= spamResult.disconnect_threshold) {
        log.warn(`[client] Disconnecting client for repeated spam: ${ws.conn?.id || 'unauthenticated'}`);
        return ws.close();
      }

      return; // drop the message
    }

    if (msgBuffer.length > MAX_MESSAGE_BYTES) {
      log.warn(`[client] Message too large: ${msgBuffer.length} bytes. Limit is ${MAX_MESSAGE_BYTES}.`);
      return rawSendControl(ws, {
        msg_type: 'bad_packet',
        payload: { 
            error: `message too large: max allowed is ${MAX_MESSAGE_BYTES} bytes`
        }
      });
    }

    try {
      const now = Date.now();
      const msg = JSON.parse(msgBuffer.toString());
      log.verbose('msg: ', msg);

      if (!validateIncomingClientMessage(msg)) {
        log.verbose(`Client ${ws.conn_id} sent a bad packet: `, errors);
        ws.msg_errors++;
        ws.lastErrorTimestamp = now;
        rawSendError(ws, {
          type: 'invalid_message',
          message: 'invalid message received'
        });

        if (ws.msg_errors > MAX_ERRORS_BEFORE_DISCONNECT) {
          log.error(`Client ${ws.conn_id} disconnected: too many errors`);
          rawSendError(ws, {
            type: 'too_many_bad_messages',
            error: 'Too many bad messages received'
          });
          return ws.close();
        }
        return;
      }
      // if we are here, we have a valid message.
      if (ws.msg_errors > 0 && (now - ws.lastErrorTimestamp) > SPAM_ERROR_RESET_WINDOW) {
        ws.msg_errors = 0;
        log.verbose(`Client ${ws.conn_id} error count resetsent a bad packet: `, errors);
      }


      if (!ws.conn) {
        if (msg.type === 'control' && msg.msg_type === 'auth') {
          const { token, reconnect } = msg;
          const clientRegistry = panApp.use('clientRegistry');

          const jwt_result = jwt.verifyNetworkJWT(token, config.jwt_config);
          // if we are auth'ing and our jwt decode failed, we reply and disconnect
          if (!jwt_result.success) {
            rawSendError(ws, {
                type: "auth.failed",
                message: "authorization failed"
            }, msg);
            return ws.close();
          }
          // if we are here, we passed jwt decoding.
          //
          if (reconnect?.conn_id && reconnect?.auth_key) {
            const resumed_conn = clientRegistry.resumeClient(reconnect.conn_id, reconnect.auth_key);
            if (resumed) {
              resumed.reconnect(ws);
              ws.conn = resumed_conn;
              const countdown_timeout = cleanupTimeouts.get(resumed.id);
              if (countdown_timeout) {
                clearTimeout(countdown_timeout);
                cleanupTimeouts.delete(resumed.id);
              }
              return resumed.sendControl({
                msg_type: 'auth.ok',
                payload: { node_id: panApp.getNodeId(), conn_id: resumed.id }
              });
            } else {
              return rawSendError(ws, { type: 'error', message: 'Invalid resume credentials' }, msg);
            }
          }

          const conn = createPanConnection(ws, 'client', jwt_result.token.client_name);
          ws.conn = conn;
          ws.conn_id = conn.id;

          const authKey = clientRegistry.registerClient(conn);
          return conn.sendControl({
            msg_type: 'auth.ok',
            payload: {
              conn_id: conn.id,
              auth_key: authKey
            }
          });
        }

        return rawSendError(ws, {
          type: 'auth.failed',
          message: 'Authorization required'
        }, msg);
      }

      const conn = ws.conn;

      if (conn.type === 'client') {
        let nodeId = panApp.getNodeId();

        const clientRouter = panApp.use('clientRouter');
        // force from node id and conn id
        if (msg.from.conn_id != conn.id) {
            log.error(`Client ${ws.conn.id} tried to send with a different conn_id, closing connection`);
            ws.close();
            return;
        }
        if (msg.from.node_id != nodeId) {
            log.error(`Client ${ws.conn.id} tried to send with a different node_id, closing connection`);
            ws.close();
            return;
        }

        // nail down our from.
        msg.from = {
            node_id: nodeId,
            conn_id: conn.id
        };
        //log.error(JSON.stringify(msg.from));
        await clientRouter.handleMessage(conn, msg);
      } else if (conn.type === 'node') {
        await handleNodeMessage(conn, msg);
      }

    } catch (err) {
      log.error(err);
      rawSendError(ws, { type: 'message_failure', message: "Message could not be processed"});
      ws.close();
    }
  });

  ws.on('close', () => {
    if (ws.conn?.type === 'client') {
      const clientRegistry = panApp.use('clientRegistry');
      if (!clientRegistry.getClient(ws.conn.id)) return;

      log.warn(`Client ${ws.conn.id} disconnected without cleanup - starting resume timer`);

      const countdown_timeout = setTimeout(() => {
        cleanupTimeouts.delete(ws.conn.id);
        cleanupClient(ws.conn);
      }, 2 * 60 * 1000);

      cleanupTimeouts.set(ws.conn.id, countdown_timeout);
    }
  });
}

async function initialize(config = {}) {
  const httpServer = createServer();
  const wss = new WebSocket.Server({ server: httpServer });
  const port = config.port || DEFAULT_CLIENT_PORT;

  wss.on('connection', (ws, req) => {
    log.info('Incoming WebSocket connection');
    handleWebSocket(ws, req, config);
  });

  httpServer.listen(port, () => {
    log.info(`[client] PAN node listening for clients on ws://localhost:${port}`);
  });

  return {
    shutdown: async () => {
      log.info('[client] Shutting down client WebSocket server...');
      return new Promise((resolve, reject) => {
        wss.close((err) => {
          if (err) {
            log.error('[client] Error closing WebSocket server:', err);
            reject(err);
          } else {
            httpServer.close((err2) => {
              if (err2) {
                log.error('[client] Error closing HTTP server:', err2);
                reject(err2);
              } else {
                log.info('[client] Client server fully shut down');
                resolve();
              }
            });
          }
        });
      });
    },
    getStatus: () => {
      const clientRegistry = panApp.use('clientRegistry');
      return {
        port,
        connectedClients: clientRegistry.getClientCount?.() || 0
      };
    }
  };
}

module.exports = { initialize };

