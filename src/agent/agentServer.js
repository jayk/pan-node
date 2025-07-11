/**
 * agentServer.js
 *
 * This module starts a WebSocket server to handle incoming agent connections.
 * It validates and authenticates agents, protects against spam,
 * supports reconnection (with a grace period), and routes messages
 * to the appropriate agentRouter or node handler.
 */

const { createServer } = require('http');
const WebSocket = require('ws');
const jwt = require('../utils/jwt');
const uuid = require('uuid');
const { log } = require('../utils/log');
const { cleanupAgent } = require('./agentControl');
const handleNodeMessage = require('../utils/nodeMessages');
const { createPanConnection, rawSendControl, rawSendError } = require('./panConnection');
const panApp = require('../panApp');

const DEFAULT_AGENT_PORT = 5295;
const MAX_MESSAGE_BYTES = 61440; // 60KB safe limit for JSON messages
const cleanupTimeouts = new Map();
const { validateIncomingAgentMessage } = require('../utils/validators');
const spamProtector = require('../utils/spamProtector');
const ACTIVE_SOCKETS = {};
const PENDING_SOCKETS = {};

/**
 * Handles an individual WebSocket connection from an agent.
 * Applies spam protection, authentication, reconnection, and message routing.
 */
function handleWebSocket(ws, req, config) {
  const spamConfig = config.spam_protection || {};
  const SPAM_WINDOW_SECONDS = spamConfig.window_seconds ?? 10;
  const SPAM_MESSAGE_LIMIT = spamConfig.message_limit ?? 50;
  const SPAM_DISCONNECT_THRESHOLD = spamConfig.disconnect_threshold ?? 5;
  const SPAM_ERROR_RESET_WINDOW = spamConfig.error_reset_window * 1000 ?? 300000;
  const MAX_ERRORS_BEFORE_DISCONNECT = spamConfig.disconnect_threshold ?? 5;

  let now = Date.now();
  ws.socket_id = uuid.v4();
  // add this socket to our active socket list
  PENDING_SOCKETS[ws.socket_id] = ws;

  ws.lastErrorTimestamp = now;
  ws.connectTimestamp = now;
  ws.msg_errors = 0;
  ws.conn_id = 'unknown';


  /**
   * Handles all incoming messages from the socket.
   */
  ws.on('message', async (msgBuffer) => {
    const now = Date.now();
    const spamResult = spamProtector.track(ws, spamConfig);
    const nodeId = panApp.getNodeId();

    // --- Spam check ---
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
        log.warn(`[agent] Disconnecting agent for repeated spam: ${ws.conn?.id || 'unauthenticated'}`);
        return ws.close();
      }

      return; // drop the message
    }

    // --- Message size check ---
    if (msgBuffer.length > MAX_MESSAGE_BYTES) {
      log.warn(`[agent] Message too large: ${msgBuffer.length} bytes. Limit is ${MAX_MESSAGE_BYTES}.`);
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
      //log.warn('inbound-msg: ', msg);

      // --- Message validation ---
      if (!validateIncomingAgentMessage(msg)) {
        log.warn(`Agent ${ws.conn_id} sent a bad packet: `, msg);
        ws.msg_errors++;
        ws.lastErrorTimestamp = now;

        rawSendError(ws, {
          type: 'invalid_message',
          message: 'invalid message received'
        });

        if (ws.msg_errors > MAX_ERRORS_BEFORE_DISCONNECT) {
          log.error(`Agent ${ws.conn_id} disconnected: too many errors`);

          rawSendError(ws, {
            type: 'too_many_bad_messages',
            error: 'Too many bad messages received'
          });

          return ws.close();
        }

        return;
      }

      // --- Reset error count if window has passed ---
      if (ws.msg_errors > 0 && (now - ws.lastErrorTimestamp) > SPAM_ERROR_RESET_WINDOW) {
        ws.msg_errors = 0;
        log.verbose(`Agent ${ws.conn_id} error count reset`);
      }

      // --- Handle authentication if not already authed ---
      if (!ws.conn) {
        if (msg.type === 'control' && msg.msg_type === 'auth') {
          const agentRegistry = panApp.use('agentRegistry');
          const agentAuthManager = panApp.use('agentAuthManager');
          log.info('received auth request');

          agentAuthManager.submitAuthRequest(msg.payload, (result) => { 
              if (!result.success) { 
                rawSendControl(ws, {
                    msg_type: 'auth.failed',
                    payload: {
                        message: result.error || "authorization failed"
                    }
                });

                return ws.close(); 
              } 

              let new_conn;
              let final_auth_key;

              // --- Resume flow ---
              if (msg.payload.auth_type === 'reconnect' && msg.payload.reconnect?.conn_id && msg.payload.reconnect?.auth_key) { 
                new_conn = agentRegistry.resumeAgent(msg.payload.reconnect.conn_id, msg.payload.reconnect.auth_key); 

                if (new_conn) { 
                  new_conn.reconnect(ws); 

                  const countdown_timeout = cleanupTimeouts.get(new_conn.id); 
                  if (countdown_timeout) { 
                    clearTimeout(countdown_timeout); 
                    cleanupTimeouts.delete(new_conn.id); 
                  } 

                  final_auth_key = msg.payload.reconnect.auth_key;
                } else { 
                    rawSendControl(ws, {
                        msg_type: 'auth.failed',
                        payload: {
                            message: 'Invalid resume credentials' 
                        }
                    }, msg);

                    return ws.close();
                } 
              } 
              // --- New session flow ---
              else { 
                const agentName = result.info?.agent_name || msg.payload.agent_name || 'unknown';
                new_conn = createPanConnection(ws, 'agent', agentName);
                final_auth_key = agentRegistry.registerAgent(new_conn);
              } 

              ws.conn = new_conn; 
              ws.conn_id = new_conn.id; 

              // remove this socket from the pending sockets because we have authenticated.
              // move it to active sockets;
              delete PENDING_SOCKETS[ws.socket_id];
              ACTIVE_SOCKETS[ws.socket_id] = ws;

              log.info(`[agentServer] Agent connected: conn_id=${new_conn.id} auth_type=${msg.payload.auth_type || 'standard'}`);

              return new_conn.sendControl({ 
                msg_type: 'auth.ok', 
                payload: { 
                  node_id: nodeId, 
                  conn_id: new_conn.id, 
                  auth_key: final_auth_key, 
                  auth_type: msg.payload.auth_type || 'standard' 
                } 
              }, msg); 
          });

          return;
        }

        // Reject if not authenticated
        return rawSendControl(ws, {
          msg_type: 'auth.failed',
          payload: {
            message: 'Authorization required'
          }
        }, msg);
      }

      // --- At this point, the agent is authenticated ---
      const conn = ws.conn;

      if (conn.type === 'agent') {
        const agentRouter = panApp.use('agentRouter');

        // Verify sender identity
        if (msg.from.conn_id != conn.id) {
            log.error(`Agent ${ws.conn.id} tried to send with a different conn_id, closing connection`);
            ws.close();
            return;
        }

        if (msg.from.node_id != nodeId) {
            log.error(`Agent ${ws.conn.id} tried to send with a different node_id, closing connection`);
            ws.close();
            return;
        }

        // Rewrite msg.from to be authoritative
        msg.from = {
            node_id: nodeId,
            conn_id: conn.id
        };

        await agentRouter.handleMessage(conn, msg);
      } else if (conn.type === 'node') {
        await handleNodeMessage(conn, msg);
      }

    } catch (err) {
      log.error(err);

      rawSendError(ws, { type: 'message_failure', message: "Message could not be processed" });

      ws.close();
    }
  });

  /**
   * Handles socket close: gives agent a 2 minute window to reconnect.
   */
  ws.on('close', () => {
    if (ws.conn?.type === 'agent') {
      const agentRegistry = panApp.use('agentRegistry');

      if (!agentRegistry.getAgent(ws.conn.id)) return;

      log.warn(`Agent ${ws.conn.id} disconnected without cleanup - starting resume timer`);

      const countdown_timeout = setTimeout(() => {
        cleanupTimeouts.delete(ws.conn.id);
        cleanupAgent(ws.conn);
      }, 2 * 60 * 1000);

      cleanupTimeouts.set(ws.conn.id, countdown_timeout);
      delete PENDING_SOCKETS[ws.socket_id];
      delete ACTIVE_SOCKETS[ws.socket_id];
    }
  });
}

// performServerMaintenance runs once per second, to do agent server maintenance.
async function performServerMaintenance(config) {

    let now = Date.now();
    log.debug('Performing Server Maintenance at ' + Math.floor(now/1000));

    let CONNECT_TIMEOUT = config.connect_timeout || 3;
    // first let's clean up any connections that haven't completed
    // the connection in the required amount of time.
    const TOO_OLD_CONNECT_TIME = now - (CONNECT_TIMEOUT * 1000);
    Object.keys(PENDING_SOCKETS).forEach( (socket_id) => {
        let ws = PENDING_SOCKETS[socket_id];
        if (ws.connectTimestamp < TOO_OLD_CONNECT_TIME) {
            log.error('Closing socket ' + socket_id + ': connect timeout.'); 
            ws.close();
            delete PENDING_SOCKETS[socket_id];
        }
    });    
}


/**
 * Starts the agent WebSocket + HTTP server.
 * Returns a control interface with shutdown and getStatus.
 */
async function initialize(config = {}) {
  const httpServer = createServer();
  const wss = new WebSocket.Server({ server: httpServer });
  const port = config.port || DEFAULT_AGENT_PORT;
  let maintenanceInterval;

  wss.on('connection', (ws, req) => {
    log.info('Incoming WebSocket connection');
    handleWebSocket(ws, req, config);
  });

  httpServer.listen(port, () => {
    log.info(`[agent] PAN node listening for agents on ws://localhost:${port}`);
  });

  maintenanceInterval = setInterval(() => { 
    performServerMaintenance(config);
  }, 1000);

  return {
    shutdown: async () => {
      log.info('[agent] Shutting down agent WebSocket server...');
      clearInterval(maintenanceInterval);
      return new Promise((resolve, reject) => {
        wss.close((err) => {
          if (err) {
            log.error('[agent] Error closing WebSocket server:', err);
            reject(err);
          } else {
            httpServer.close((err2) => {
              if (err2) {
                log.error('[agent] Error closing HTTP server:', err2);
                reject(err2);
              } else {
                log.info('[agent] Agent server fully shut down');
                resolve();
              }
            });
          }
        });
      });
    },
    getStatus: () => {
      const agentRegistry = panApp.use('agentRegistry');
      return {
        port,
        connectedAgents: agentRegistry.getAgentCount?.() || 0
      };
    }
  };
}

module.exports = { initialize };
