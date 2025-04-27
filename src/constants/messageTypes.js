// constants/messageTypes.js

const VALID_CLIENT_MESSAGE_TYPES = [
    'direct',
    'broadcast',
    'control'
];

const VALID_PEER_MESSAGE_TYPES = [
    'peer_control'
];

const VALID_AGENT_MESSAGE_TYPES = [
    'direct',
    'broadcast',
    'agent_control'
];

module.exports = {
    VALID_CLIENT_MESSAGE_TYPES,
    VALID_PEER_MESSAGE_TYPES,
    VALID_AGENT_MESSAGE_TYPES
};
