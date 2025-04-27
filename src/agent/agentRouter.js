// node/agent/agentRouter.js

const panApp = require('../panApp');
const { log } = require('../utils/log');
const nodeMessages = require('../utils/nodeMessages');
const agentControl = require('./agentControl');

async function initialize(config = {}) {
  const router = {
    async handleMessage(conn, msg) {
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'control':
          return agentControl.processControl(conn, msg);

        case 'broadcast':
          return router.deliverBroadcast(conn, msg);

        case 'direct':
          return router.deliverDirect(conn, msg);

        default:
          return conn.sendError(`Unknown message type: ${msg.type}`, msg);
      }
    },

    deliverBroadcast(fromConn, msg) {
      const { group: groupId, msg_type: msgType } = msg;
      const nodeId = panApp.getNodeId();
      const groupManager = panApp.use('groupManager');
      const agentRegistry = panApp.use('agentRegistry');

      const recipients = groupManager.getGroupRecipients(groupId, msgType);
      if (!recipients || recipients.size === 0) {
        log.debug(`broadcast: no local recipients for ${msgType} in ${groupId}`);
      } else {
        for (const connId of recipients) {
          if (connId === fromConn.id) continue;
          const target = agentRegistry.getAgent(connId);
          if (target) target.send(msg);
        }
      }

      // Send to peer router for relaying to other nodes
      nodeMessages.emit('outbound:agent_broadcast', {
        from: {
            node_id: nodeId,
            conn_id: fromConn.id
        },
        message: msg
      });
    },

    deliverDirect(fromConn, msg) {
      const to = msg.to;
      const nodeId = panApp.getNodeId();
      const agentRegistry = panApp.use('agentRegistry');

      if (!to || typeof to !== 'object' || !to.node_id || !to.conn_id) {
        return fromConn.sendError('invalid "to" field in direct message', msg);
      }

      if (to.node_id === nodeId) {
        // Local delivery
        const targetAgent = agentRegistry.getAgent(to.conn_id);
        // don't think this check makes sense.
/*
        if (!targetAgent?.ws?.conn) {
          return fromConn.sendError(`agent ${to.conn_id} not found on node ${nodeId}`, msg);
        }
*/

        targetAgent.send({
          type: 'direct',
          msg_type: msg.msg_type,
          in_response_to: msg.msg_id,
          from: {
            node_id: nodeId,
            conn_id: fromConn.id
          },
          payload: msg.payload
        });
      } else {
        // Relay to peer router via async bus
          nodeMessages.emit('outbound:agent_direct', {
          from: fromConn,
          message: msg
        });
      }
    },

    shutdown: async () => {
      log.info('[agentRouter] Shutdown complete');
    }
  };

  return router;
}

module.exports = { initialize };

