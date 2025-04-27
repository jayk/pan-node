// node/peer/peerServer.js

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const {
    PeerConnection
} = require('./peerConnection');
const {
    log
} = require('../utils/log');
const panApp = require('../panApp');
const uuid = require('uuid');
const {
    AgentConnection
} = require('./agentConnection'); // bring in AgentConnection
const {
    validatePeerMessage
} = require('../utils/validators');


const DEFAULT_PEER_PORT = 5874;
let sessionNonce = uuid.v4();

function getSessionNonce() {
    return sessionNonce;
}

function regenerateSessionNonce() {
    sessionNonce = uuid.v4();
}

let wss = null;
let portInUse = null;

function handleConnection(ws) {
    const peerRegistry = panApp.use('peerRegistry');
    const agentRegistry = panApp.use('agentRegistry'); // NEW

    log.info('[peer] Incoming connection...');

    ws.once('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data.toString());
        } catch (err) {
            log.warn('[peer] Invalid JSON from connection:', data.toString());
            ws.close();
            return;
        }

        if (!isValidBaseFields(msg)) {
            log.warn('[peer] Invalid inbound message during handshake!');
            ws.close();
        }

        if (msg.type === 'peer_control' && msg.msg_type === 'hello') {
            if (!validatePeerMessage(msg)) {
                log.warn('[peer] Invalid peer message during handshake!');
                ws.close();
            }

            // Handle peer handshake - needs refactor - we assign node id, generally speaking
            const {
                node_id,
                jwt: nodeJwt
            } = msg.payload || {};
            if (!node_id || !nodeJwt) {
                log.warn('[peer] Missing node_id or jwt in peer handshake');
                ws.close();
                return;
            }

            const secret = peerRegistry.getSecretForNode(node_id);
            if (!secret) {
                log.warn(`[peer] No shared secret for node ${node_id}`);
                ws.close();
                return;
            }

            try {
                jwt.verify(nodeJwt, secret, {
                    audience: 'pan-peer'
                });
            } catch (err) {
                log.warn(`[peer] Invalid JWT for peer node ${node_id}:`, err.message);
                ws.close();
                return;
            }

            const peerRouter = panApp.use('peerRouter');
            const peer = new PeerConnection(ws, node_id, peerRouter);
            peerRegistry.registerPeer(node_id, peer);
            log.info(`[peer] Registered peer node: ${node_id}`);
        } else if (msg.type === 'agent_control' && msg.msg_type === 'hello') {
            if (!validateAgentMessage(msg)) {
                log.warn('[peer] Invalid peer message during handshake!');
                ws.close();
            }

            // if agent_control has a TTL greater than 1, we error here.
            if (msg.ttl > 1) {
                log.warn('[peer] Invalida Agent message: TTL > 1');
                ws.close();
                return;
            }
            // Handle special agent handshake
            const {
                agentType,
                capabilities,
                jwt: agentJwt
            } = msg.payload || {};
            if (!agentType || !Array.isArray(capabilities) || !agentJwt) {
                log.warn('[peer] Invalid special agent handshake payload');
                ws.close();
                return;
            }

            try {
                // TODO: Validate agent JWT properly
                jwt.verify(agentJwt, 'dummy-secret-for-now', {
                    audience: 'pan-agent'
                });
            } catch (err) {
                log.warn(`[peer] Invalid JWT for agent ${agentType}:`, err.message);
                ws.close();
                return;
            }

            const agentId = ws._socket.remoteAddress + ':' + ws._socket.remotePort; // or assign a UUID
            const agentConn = new AgentConnection(ws, agentId, agentType, capabilities);

            log.info(`[peer] Registered special agent: ${agentType} with capabilities: ${capabilities.join(', ')}`);
            agentRegistry.registerAgent(agentId, agentConn);

            agentConn.sendWelcome(peerStatus.getNodeId(), getSessionNonce());


        } else {
            log.warn('[peer] Unexpected message type on handshake:', msg.type, msg.msg_type);
            ws.close();
            return;
        }
    });
}

async function startListening(config = {}) {
    if (wss) {
        log.warn('[peer] Peer server already running.');
        return;
    }

    const port = config.port || DEFAULT_PEER_PORT;
    wss = new WebSocket.Server({
        port
    });

    wss.on('connection', handleConnection);

    wss.on('listening', () => {
        log.info(`[peer] Peer WebSocket server listening on port ${port}`);
        portInUse = port;
    });

    wss.on('close', () => {
        log.info('[peer] Peer WebSocket server closed.');
        wss = null;
        portInUse = null;
    });

    wss.on('error', (err) => {
        log.error('[peer] Peer WebSocket server error:', err);
    });
}

async function stopListening() {
    if (!wss) {
        log.warn('[peer] Peer server is not running.');
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

async function initialize(config = {}) {
    await startListening(config);
}

function getStatus() {
    const peerRegistry = panApp.use('peerRegistry');
    return {
        port: portInUse,
        connectedPeers: peerRegistry.getPeerCount() || 0,
        listening: !!wss
    };
}

module.exports = {
    initialize,
    startListening,
    stopListening,
    getStatus,
    getSessionNonce
};
