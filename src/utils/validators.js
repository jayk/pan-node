const MAX_TTL = 255;
const MIN_TTL = 0;

const VALID_MSG_TYPE = /^[\w.@]+$/u;

const VALID_CLIENT_MESSAGE_TYPES = [
    'direct',
    'broadcast',
    'control'
];

function validateClientMessage(msg) {
    const errors = [];

    if (!VALID_CLIENT_MESSAGE_TYPES.includes(msg.type)) {
        errors.push('Invalid message type: ', msg.type);
    }
        
    if (!msg.msg_id || typeof msg.msg_id !== 'string') {
        errors.push('missing or invalid msg_id');
    }

    if (msg.type == 'broadcast' || msg.type == 'direct') {
        if (!msg.payload || typeof msg.payload !== 'object') {
            errors.push('missing or invalid payload');
        }
        if (!msg.msg_type || typeof msg.msg_type !== 'string') {
            errors.push('message missing msg_type');
        } else if (msg.msg_type.length > 64) {
            errors.push('msg_type too long');
        } else if (!VALID_MSG_TYPE.test(msg.msg_type)) {
            errors.push('invalid msg_type provided');
        }
    }
    if (msg.type == 'direct') {
        if (!msg.to.node_id || !msg.to.conn_id) {
            errors.push('direct message with invalid to');
        }
    }

    const ttl = Number(msg.ttl);
    if (!Number.isInteger(ttl) || ttl < MIN_TTL || ttl > MAX_TTL) {
        errors.push(`invalid ttl (must be ${MIN_TTL}–${MAX_TTL})`);
    }

    if (errors.length > 0) { 
        return errors;
    } else {
        return undefined;
    }
}

module.exports = {
    validateClientMessage
};
