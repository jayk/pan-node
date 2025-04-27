// node/agentDispatcher.js
const agentRegistry = require('./agentRegistry');
const groupManager = require('./groupManager');
const log = require('../utils/log');
const uuid = require('uuid');

const PAN_ROOT_ID="219dd24f-63c4-5e35-b886-da1b21ecc0e0";

const agentDispatcher = {
    _initialized: false,
    nodeId: null,
    recentMessages: new Set(), // placeholder for msg_id deduping

    initialize(new_config) {
        if (new_config.node_id) {
            this.nodeId = uuid.v5(new_config.node_id, PAN_ROOT_ID);
        } else {
            this.nodeId = uuid.v4();
        }
        this._initialized = true;
        log.info(`PAN agent Dispatcher initialized with nodeId=${this.nodeId}`);
    },

    _ensureInitialized() {
        if (!this._initialized) {
            throw new Error('PanRouter not initialized, unable to continue');
        }
    },

    handleMessage(pan, msg) {
        this._ensureInitialized();
        switch (msg.type) {
            case 'broadcast':
                return this.broadcast(msg, pan);
            case 'direct':
                return this.direct(msg, pan);
            case 'ping_request':
                return this.ping(msg, pan);
            default:
                return pan.sendError(`Unknown routed message type: ${msg.type}`, msg);
        }
    },

    broadcast(msg, pan) {
        const groupId = msg.group;
        const msgType = msg.msg_type;

        const recipients = groupManager.getGroupRecipients(groupId, msgType);
        if (!recipients || recipients.size === 0) {
            log.debug(`broadcast: no recipients for ${msgType} in ${groupId}`);
            return;
        }

        for (const agentId of recipients) {
            const target = agentRegistry.getAgent(agentId);
            if (target && agentId !== pan.id) {
                target.send(msg);
            }
        }
        // placeholder for relay to other PAN nodes
    },

    direct(msg, fromPan) {
        this._ensureInitialized();

        const to = msg.to;

        if (!to || typeof to !== 'object' || !to.node_id || !to.conn_id) {
            return fromPan.sendError('invalid "to" field in direct message', msg);
        }

        if (to.node_id === this.nodeId) {
            // Local delivery
            const targetAgent = agentRegistry.getAgent(to.conn_id);
            if (!targetAgent?.ws?.pan) {
                return fromPan.sendError(`agent ${to.conn_id} not found on node ${this.nodeId}`, msg);
            }

            targetAgent.ws.pan.send({
                type: 'direct',
                msg_type: msg.msg_type,
                in_response_to: msg.msg_id,
                from: {
                    node_id: this.nodeId,
                    conn_id: fromPan.id
                },
                payload: msg.payload
            });
        } else {
            // Remote delivery (relay to peer node)
            
            // relay to peerRouter. TBD
        }
    },

    ping(msg, fromPan) {
        const payload = msg.payload || {};
        const destNode = payload.dest_node;
        const ttl = typeof payload.ttl === 'number' ? payload.ttl : 1;
        const msgText = payload.msg || '';

        if (typeof msgText !== 'string' || msgText.length > 64) {
            return fromPan.sendControl({
                msg_type: 'ping_response', 
                payload: {
                    error: 'msg must be a string under 64 characters'
                }
            }, msg);
        }

        if (!destNode || typeof destNode !== 'string') {
            return fromPan.sendControl({
                msg_type: 'ping_response', 
                payload: {
                    error: 'missing or invalid dest_node'
                }
            }, msg);
        }

        const newTTL = ttl - 1;

        if (newTTL <= 0 || destNode === this.nodeId) {
            // TTL exhausted or reached local node → reply
            return fromPan.sendControl({
                msg_type: 'ping_response', 
                ttl: newTTL,
                payload: {
                    msg: msgText,
                    reached: this.nodeId
                }
            }, msg);
        }

        // 🔜 TODO: relay to peer node
        log.info(`Ping with TTL=${ttl} relayed to dest_node=${destNode}`);
        // e.g., peerRegistry.sendToNode(destNode, msg);

        return; // not responding directly now
    },

};

module.exports = agentDispatcher;
