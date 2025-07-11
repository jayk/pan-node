// validators.js
// PAN fast packet validators
// 
// These validators enforce basic syntactic correctness of incoming packets
// They are designed to be very fast: fail early, no allocations, minimal branching.
//
// Usage:
// - First call the appropriate validateIncomingXMessage(msg)
//   - validateIncomingAgentMessage(msg)
//   - validateIncomingAgentMessage(msg, localNodeId)
//   - validateIncomingPeerMessage(msg)
// - These return `true` (valid) or `false` (invalid)
// - If invalid, immediately close the connection.
const { log } = require('./log');
const constants = require('../constants/constants');

const VALID_MSG_TYPE = /^[\w.@]+$/u;

const MAX_TTL = 255;
const MIN_TTL = 0;

const MAX_AGENT_TTL = 1;
const MIN_AGENT_TTL = 0;

const EXTENDED_GROUP_ID_LENGTH = 73; // node_id (36) + ":" (1) + uuid (36)

const FORCE_DEBUGGING = true;


// Ultra-fast "looks like a UUID" checker
function isFastUuid(str) {
    return typeof str === 'string' &&
           str.length === 36 &&
           str[8] === '-' &&
           str[13] === '-' &&
           str[18] === '-' &&
           str[23] === '-';
}

// --- Universal basic field validation ---
// This is meant to do a basic validation on a packet and fail
// as quickly as possible with as little overhead as possible.
function isValidBaseFields(msg, { isAgent = false } = {}) {
    //log.verbose = log.warn;
    FORCE_DEBUGGING && log.verbose('msg check');
    if (typeof msg !== 'object' || msg === null) return false;
    FORCE_DEBUGGING && log.verbose('msg_id check');
    if (typeof msg.msg_id !== 'string' || !isFastUuid(msg.msg_id)) return false;
    FORCE_DEBUGGING && log.verbose('msg from object check');
    if (typeof msg.from !== 'object' || msg.from === null) return false;
    FORCE_DEBUGGING && log.verbose('msg from node_id check');
    if (typeof msg.from.node_id !== 'string' || !isFastUuid(msg.from.node_id)) return false;
    FORCE_DEBUGGING && log.verbose('msg from conn_id check');
    if (typeof msg.from.conn_id !== 'string') return false;
    FORCE_DEBUGGING && log.verbose('msg from msg_type check');
    if (typeof msg.msg_type !== 'string' || msg.msg_type.length > 64 || !VALID_MSG_TYPE.test(msg.msg_type)) return false;
    FORCE_DEBUGGING && log.verbose('msg payload check');
    if (typeof msg.payload !== 'object' || msg.payload === null) return false;

    FORCE_DEBUGGING && log.verbose('msg ttl check');
    const ttl = Number(msg.ttl);
    const minTtl = isAgent ? MIN_AGENT_TTL : MIN_TTL;
    const maxTtl = isAgent ? MAX_AGENT_TTL : MAX_TTL;
    if (!Number.isInteger(ttl) || ttl < minTtl || ttl > maxTtl) return false;

    FORCE_DEBUGGING && log.verbose('ran the gauntlet');
    return true;
}

// --- Agent-specific validation ---
function validateAgentMessage(msg) {
    if (!constants.VALID_AGENT_MESSAGE_TYPES.includes(msg.type)) return false;

    switch (msg.type) {
        case 'direct':
            if (!msg.to || typeof msg.to.node_id !== 'string' || !isFastUuid(msg.to.node_id)) return false;
            if (typeof msg.to.conn_id !== 'string') return false;
            return true;

        case 'broadcast':
            if (!msg.group || typeof msg.group !== 'string' || msg.group.length !== 36) return false;
            return true;

        case 'control':
            return true; // No extra fields required

        default:
            return false;
    }
}

// --- Special agent-specific validation ---
function validateSpecialAgentMessage(msg, localNodeId) {
    if (!constants.VALID_AGENT_MESSAGE_TYPES.includes(msg.type)) return false;

    switch (msg.type) {
        case 'direct':
            if (!msg.to || typeof msg.to.node_id !== 'string' || !isFastUuid(msg.to.node_id)) return false;
            if (typeof msg.to.conn_id !== 'string') return false;
            if (msg.to.node_id !== localNodeId || msg.to.conn_id !== localNodeId) return false;
            return true;

        case 'broadcast':
            if (!msg.group || typeof msg.group !== 'string' || msg.group.length !== EXTENDED_GROUP_ID_LENGTH) return false;
            return true;

        case 'agent_control':
            return true; // No extra fields required

        default:
            return false;
    }
}

// --- Peer-specific validation ---
function validatePeerMessage(msg) {
    if (!constants.VALID_PEER_MESSAGE_TYPES.includes(msg.type)) return false;

    // No extra peer fields beyond base validation at this time
    return true;
}

// --- Public functions for fast validation of incoming messages ---

function validateIncomingAgentMessage(msg) {
    return isValidBaseFields(msg, { isAgent: false }) &&
           validateAgentMessage(msg);
}

function validateIncomingSpecialAgentMessage(msg, localNodeId) {
    return isValidBaseFields(msg, { isAgent: true }) &&
           validateAgentMessage(msg, localNodeId);
}

function validateIncomingPeerMessage(msg) {
    return isValidBaseFields(msg, { isAgent: false }) &&
           validatePeerMessage(msg);
}

module.exports = {
    isFastUuid,
    isValidBaseFields,
    validateAgentMessage,
    validateAgentMessage,
    validatePeerMessage,
    validateIncomingAgentMessage,
    validateIncomingAgentMessage,
    validateIncomingPeerMessage
};
