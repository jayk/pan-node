// node/agentControl.js
const panApp = require('../panApp');
const { validateAgentMessage } = require('../utils/validators');
const { validate: isUuid } = require('uuid');
const nodeMessages = require('../utils/nodeMessages');
const { log } = require('../utils/log');

// --- Message Handlers ---
function handleJoinGroup(conn, msg) {
    const groupManager = panApp.use('groupManager');
    const connId = conn.id;
    const { group, msg_types } = msg.payload;


    if (typeof group !== 'string') {
        return conn.sendControl({ 
            msg_type: 'join_group_reply', 
            payload: { 
                status: 'failed', 
                error: 'invalid_group_id',
                message: 'Invalid group ID provided' 
            }
        }, msg);
    }

    groupManager.joinGroup(connId, group, msg_types);

    conn.sendControl({ 
        msg_type: 'join_group_reply', 
        payload: { 
            status: 'ok', 
            group 
        }
    }, msg);

    log.info(`Agent ${connId} joined group ${group}`);
}

function handleLeaveGroup(conn, msg) {
    const groupManager = panApp.use('groupManager');
    const connId = conn.id;
    const { group } = msg.payload;


    if (typeof group !== 'string') {
        return conn.sendControl({ 
            msg_type: 'leave_group_reply', 
            payload: { 
                status: 'failed', 
                error: 'invalid_group_id',
                message: 'Invalid group ID provided'
            }
        }, msg);
    }

    groupManager.leaveGroup(connId, group);

    conn.sendControl({ 
        msg_type: 'leave_group_reply', 
        payload: { 
            status: 'ok', 
            group 
        }
    }, msg);

    log.info(`Agent ${connId} left group ${group}`);
}



function handlePing(conn, msg) {
  const { payload = {} } = msg;
  const { dest_node_id, msg: pingMessage } = payload;

  // Validate that only dest_node_id and msg are present (and optionally ttl)
  const allowedKeys = ['dest_node_id', 'msg'];
  for (const key of Object.keys(payload)) {
    if (!allowedKeys.includes(key)) {
      return conn.sendControl({
        msg_type: 'ping_response',
        payload: { error: `invalid field in payload: ${key}` }
      }, msg);
    }
  }

  if (!isUuid(dest_node_id)) {
    return conn.sendControl({
      msg_type: 'ping_response',
      payload: { error: 'dest_node_id must be a valid UUID' }
    }, msg);
  }

  if (typeof msg.ttl != 'number' || msg.ttl < 0 || msg.ttl > 255) {
    return conn.sendControl({
      msg_type: 'ping_response',
      payload: { error: 'missing or invalid ttl provided' }
    }, msg);
  }

  if (typeof pingMessage !== 'string' || pingMessage.length > 64) {
    return conn.sendControl({
      msg_type: 'ping_response',
      payload: { error: 'msg must be a string of 64 characters or fewer' }
    }, msg);
  }

  // Valid ping — relay to peer router (via nodeMessages for async decoupling)
  nodeMessages.emit('outbound:agent_ping', msg);
}

function handleDisconnect(conn, msg) {
    log.info(`Agent ${conn.id} requested disconnect`);

    // Immediate cleanup
    cleanAgent(conn);

    // Close the socket
    conn.ws.close(); // triggers `ws.on('close')` but it's now a no-op
}

function cleanupAgent(conn) {
    const groupManager = panApp.use('groupManager');
    const agentRegistry = panApp.use('agentRegistry');
    log.info(`Cleaning up after agent ${conn.id}`);

    groupManager.removeAgentFromAllGroups(conn.id);
    agentRegistry.unregisterAgent(conn.id);
}

function processControl(conn, msg) {
    switch(msg.msg_type) {
        case 'join_group':
            handleJoinGroup(conn, msg);
            break;
        case 'leave_group':
            handleLeaveGroup(conn, msg);
            break;
        case 'ping_request':
            handlePing(conn, msg);
            break;
        case 'disconnect':
            handleDisconnect(conn, msg);
            break;
        default:
            conn.sendError(`unknown agent message type: ${msg.msg_type}`, msg);
            break;
    } 
}

// --- Entry Point ---

module.exports = {
    processControl,
    cleanupAgent
}
