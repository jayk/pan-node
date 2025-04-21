// node/clientMessages.js
const clientRegistry = require('./clientRegistry');
const groupManager = require('./groupManager');
const clientDispatcher = require('./clientDispatcher');
const { validateClientMessage } = require('../utils/validators');
const log = require('../utils/log');

// --- Message Handlers ---

function handleJoinGroup(pan, msg) {
    const clientId = pan.id;
    const { group, msg_types } = msg;

    if (typeof group !== 'string') {

        return pan.sendControl({ 
            msg_type: 'join_group_reply', 
            success: false, 
            payload: { error: 'invalid group ID' }
        }, msg);

    }

    groupManager.joinGroup(clientId, group, msg_types);

    pan.sendControl({ 
        msg_type: 'join_group_reply', 
        success: true, 
        payload: { group }
    }, msg);

    log.info(`Client ${clientId} joined group ${group}`);
}

function handleLeaveGroup(pan, msg) {
    const clientId = ws._pan.id;
    const { group } = msg;

    if (typeof group !== 'string') {
        return pan.sendControl({ 
            msg_type: 'leave_group_reply', 
            success: false, 
            payload: { error: 'invalid group ID', group }
        }, msg);
    }

    groupManager.leaveGroup(clientId, group);

    pan.sendControl({ 
        msg_type: 'leave_group_reply', 
        success: true, payload: { group }
    }, msg);

    log.info(`Client ${clientId} left group ${group}`);
}

function handlePing(pan, msg) {
    return clientDispatcher.handleMessage(pan, msg);
}

function handleBroadcast(pan, msg) {
    return clientDispatcher.handleMessage(pan, msg);
}

function handleDirect(pan, msg) {
    return clientDispatcher.handleMessage(pan, msg);
}

function handleDisconnect(pan, msg) {
    log.info(`Client ${pan.id} requested disconnect`);

    // Immediate cleanup
    cleanClient(pan);

    // Close the socket
    pan.ws.close(); // triggers `ws.on('close')` but it's now a no-op
}

function cleanupClient(pan) {
    log.info(`Cleaning up after client ${pan.id}`);

    groupManager.removeClientFromAllGroups(pan.id);
    clientRegistry.unregisterClient(pan.id);
}

function handleClientControl(pan, msg) {
    switch(msg.msg_type) {
        case 'join_group':
            handleJoinGroup(pan, msg);
            break;
        case 'leave_group':
            handleLeaveGroup(pan, msg);
            break;
        case 'ping_request':
            handlePing(pan, msg);
            break;
        case 'disconnect':
            handleDisconnect(pan, msg);
            break;
        default:
            pan.sendError(`unknown client message type: ${msg.msg_type}`, msg);
            break;
    } 
    

}

async function handleClientMessage(pan, msg) {
    log.verbose(msg);
    const handler = message_handlers[msg.type] || message_handlers['*'];
    const errors = validateClientMessage(msg, pan);
    if (errors.length > 0) {
        pan._recordError(errors.join('; '), msg);
        log.warn('validation errors: ', errors);
        return;
    }
    log.verbose('hi');

    // Sanitize sender
    msg.from = {
        node_id: clientDispatcher.nodeId,
        client_id: pan.id
    };
    log.verbose('msg', msg);
    return handler(pan, msg);
};

// --- Dispatch Table ---

const message_handlers = {
    'client_control': handleClientControl,
    'broadcast': handleBroadcast,
    'direct': handleDirect,
    '*': (pan, msg) => {
        pan.sendError(`unknown client message type: ${msg.type}`, msg);
    }
};

// --- Entry Point ---

module.exports = {
    handleClientMessage,
    cleanupClient
}
