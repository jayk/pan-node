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

const NULL_ID = '00000000-0000-0000-0000-000000000000';

function isNullId(id) {
    return id === NULL_ID;
}

function isNullFromField(from) {
    return from &&
           isNullId(from.node_id) &&
           isNullId(from.conn_id);
}


module.exports = {
    VALID_CLIENT_MESSAGE_TYPES,
    VALID_PEER_MESSAGE_TYPES,
    VALID_AGENT_MESSAGE_TYPES,
    NULL_ID,
    isNullId,
    isNullFromField
};
