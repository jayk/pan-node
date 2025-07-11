/**
 * peerServer.js
 *
 * Sets up a WebSocket server to handle incoming PAN peer and agent connections.
 *
 * - Accepts connections from other PAN nodes ("peers") and special agents.
 * - Performs an initial handshake via JSON messages with required fields.
 * - Verifies JWTs using a shared secret (for peers) or placeholder (for agents).
 * - Delegates connections to PeerConnection or AgentConnection handlers.
 * - Exposes session nonce, status, and shutdown capabilities.
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { PeerConnection } = require('./peerConnection');
const { AgentConnection } = require('./agentConnection');
const { log } = require('../utils/log');
const panApp = require('../panApp');
const uuid = require('uuid');
const { getTrustValidator } = require('../node/vouchsafeTrust');
const { rawSendControl, rawSendError } = require('../agent/panConnection');

const {
    isValidBaseFields,
    validatePeerMessage,
    validateAgentMessage
} = require('../utils/validators');

const DEFAULT_PEER_PORT = 5874;

let wss = null;

let portInUse = null;

let sessionNonce = uuid.v4();

let peerTrustValidator;

/**
 * Returns the current session nonce, used to differentiate node restarts.
 */
function getSessionNonce() {
    return sessionNonce;
}

/**
 * Regenerates the session nonce.
 */
function regenerateSessionNonce() {
    sessionNonce = uuid.v4();
}

/**
 * Handles a single WebSocket connection, routing it to either a peer or agent handler.
 *
 * @param {WebSocket} ws - The incoming WebSocket connection.
 */
async function handleConnection(ws) {
    const peerRegistry = panApp.use('peerRegistry');
    const agentRegistry = panApp.use('agentRegistry');
    const peerStatus = panApp.use('peerStatus');

    log.info('[peer] Incoming connection...');

    ws.once('message', async (data) => {
        let msg;

        let decoded;

        try {
            msg = JSON.parse(data.toString());
        } catch (err) {
            log.warn('[peer] Invalid JSON during handshake');
            ws.close();
            return;
        }

        if (!isValidBaseFields(msg)) {
            log.warn('[peer] Invalid base fields during handshake');
            ws.close();
            return;
        }

        // Handle PEER handshake
        if (msg.type === 'peer_control' && msg.msg_type === 'hello') {
            if (!validatePeerMessage(msg)) {
                log.warn('[peer] Invalid peer handshake message');
                ws.close();
                return;
            }

            const authPayload = msg.payload || {};

            if (!authPayload.token) {
                log.warn('[peer] Missing token in peer handshake');
                ws.close();
                return;
            }

            try {
                decoded = await peerTrustValidator.validateToken(authPayload.token);

                if (!decoded.node_id) {
                    log.warn('[peer] Missing node_id in peer token');
                    ws.close();
                    return;
                }

                log.warn('MMMMMMMMMMMMMMMMm', decoded);
            } catch (err) {
                log.warn('Peer auth failed, token error: ', err);

                rawSendError(ws, {
                    msg_type: 'auth.failed',
                    payload: {
                        message: 'Access Denied'
                    }
                });
                ws.close();
                return;
            }
            // now we verify if we trust this node.
            
            let trustResult;
            try {
                trustResult = await peerTrustValidator.isTokenTrusted(authPayload.token, authPayload.tokens, ['peer-connect']);
                if (trustResult.trusted) {
                    // allow the peer to connect.
                    const peerRouter = panApp.use('peerRouter');
                    let peer_connect_token = trustResult.decoded;

                    let existingPeer = peerRegistry.getPeer(peer_connect_token.node_id);

                    // if we have an existing peer for that node id, and it's not owned by the same vouchsafe_id
                    // then something is hinky and we need to fail.
                    if (existingPeer && existingPeer.details.vouchsafe_id != peer_connect_token.iss) {
                        // a peer with this node id exists already, and is not
                        // owned by the same issuer. So we fail and disconnect.
                        throw new Error('newly connected peer ' + peer_connect_token.iss + 
                                        ' tried to claim an active node_id: ' + peer_connect_token.node_id);
                    }
                    // TODO: We probably need a more in-depth check against node_ids that might already
                    // be present in the network. For now, though, this is good enough.
                    
                    // if we are here, we have a valid connect request
                    let details = {
                        connect_token: peer_connect_token,
                        peer_name: trustResult.decoded.identifier || trustResult.decoded.iss,
                        vouchsafe_id: trustResult.decoded.iss,
                    }

                    const peer = new PeerConnection(ws, authPayload.node_id, peerRouter, details);
                    peerRegistry.registerPeer(authPayload.node_id, peer);

                    log.info(`[peer] Registered peer node: ${node_id}`);

                    // TODO: should send a greeting packet of some kind and trigger routing exchange
                    
                    return;
                } else {
                    log.warn('Peer auth failed, issuer not trusted for peer-connect. ');
                    rawSendError(ws, {
                        msg_type: 'auth.failed',
                        payload: {
                            message: 'Access Denied'
                        }
                    });
                    ws.close();
                    return;
                }
            } catch (err) {
                log.warn('Peer auth failed, trust check error: ', err);
                rawSendError(ws, {
                    msg_type: 'auth.failed',
                    payload: {
                        message: 'Access Denied'
                    }
                });
                ws.close();
                return;
            }
        }

        // Handle SPECIAL AGENT handshake
        else if (msg.type === 'agent_control' && msg.msg_type === 'hello') {
            if (!validateAgentMessage(msg, peerStatus.getNodeId())) {
                log.warn('[peer] Invalid agent handshake message');
                ws.close();
                return;
            }

            const { agentType, capabilities, jwt: agentJwt } = msg.payload || {};

            if (!agentType || !Array.isArray(capabilities) || !agentJwt) {
                log.warn('[peer] Invalid special agent handshake payload');
                ws.close();
                return;
            }

            try {
                // NOTE: This is a placeholder and must be replaced with proper auth
                jwt.verify(agentJwt, 'dummy-secret-for-now', { audience: 'pan-agent' });
            } catch (err) {
                log.warn(`[peer] Invalid JWT for agent ${agentType}: ${err.message}`);
                ws.close();
                return;
            }

            const agentId = ws._socket.remoteAddress + ':' + ws._socket.remotePort;

            const agentConn = new AgentConnection(ws, agentId, agentType, capabilities);

            agentRegistry.registerAgent(agentId, agentConn);

            log.info(`[peer] Registered special agent: ${agentType} (${agentId})`);

            agentConn.sendWelcome(peerStatus.getNodeId(), getSessionNonce());
        }

        // Unknown or unexpected message type
        else {
            log.warn('[peer] Unexpected message type during handshake:', msg.type, msg.msg_type);
            ws.close();
            return;
        }
    });
}

/**
 * Initializes the peer WebSocket server.
 *
 * @param {object} config - Optional configuration object (e.g. custom port).
 * @returns {Promise<object>} - API functions for shutdown, status, and session nonce.
 */
async function initialize(config = {}) {
    const port = config.port || DEFAULT_PEER_PORT;

    if (typeof config.trusted_peers_config_file != 'string') {
        throw new Error('No trusted_peers_config_file provided. Unable to continue');
    }
    peerTrustValidator = getTrustValidator('peer', { path: config.trusted_peers_config_file });

    return new Promise((resolve, reject) => {
        if (wss) {
            log.warn('[peer] Peer server already running.');
            resolve({
                shutdown,
                getStatus,
                getSessionNonce
            });
            return;
        }

        wss = new WebSocket.Server({ port });

        wss.on('connection', handleConnection);

        wss.on('listening', () => {
            log.info(`[peer] Peer WebSocket server listening on port ${port}`);
            portInUse = port;
            resolve({
                shutdown,
                getStatus,
                getSessionNonce
            });
        });

        wss.on('close', () => {
            log.info('[peer] Peer WebSocket server closed.');
            wss = null;
            portInUse = null;
        });

        wss.on('error', (err) => {
            log.error('[peer] Peer WebSocket server error:', err);
            reject(err);
        });
    });
}

/**
 * Gracefully shuts down the peer WebSocket server.
 */
async function shutdown() {
    if (!wss) {
        log.warn('[peer] Peer server not running.');
        return;
    }

    log.info('[peer] Shutting down peer WebSocket server...');

    return new Promise((resolve, reject) => {
        wss.close((err) => {
            if (err) {
                log.error('[peer] Error shutting down peer server:', err);
                reject(err);
            } else {
                resolve();
            }
        });
    });
}

/**
 * Returns the current status of the peer server, including port and peer count.
 *
 * @returns {object}
 */
function getStatus() {
    const peerRegistry = panApp.use('peerRegistry');

    return {
        port: portInUse,
        connectedPeers: peerRegistry.getPeerCount?.() || 0,
        listening: !!wss
    };
}

module.exports = {
    initialize
};
