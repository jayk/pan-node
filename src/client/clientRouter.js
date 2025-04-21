// node/client/clientRouter.js

const panApp = require('../panApp');
const { log } = require('../utils/log');
const nodeMessages = require('../utils/nodeMessages');
const clientControl = require('./clientControl');

async function initialize(config = {}) {
  const router = {
    async handleMessage(conn, msg) {
      if (!msg || typeof msg !== 'object') return;

      switch (msg.type) {
        case 'control':
          return clientControl.processControl(conn, msg);

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
      const clientRegistry = panApp.use('clientRegistry');

      const recipients = groupManager.getGroupRecipients(groupId, msgType);
      if (!recipients || recipients.size === 0) {
        log.debug(`broadcast: no local recipients for ${msgType} in ${groupId}`);
      } else {
        for (const connId of recipients) {
          if (connId === fromConn.id) continue;
          const target = clientRegistry.getClient(connId);
          if (target) target.send(msg);
        }
      }

      // Send to peer router for relaying to other nodes
      nodeMessages.emit('outbound:client_broadcast', {
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
      const clientRegistry = panApp.use('clientRegistry');

      if (!to || typeof to !== 'object' || !to.node_id || !to.conn_id) {
        return fromConn.sendError('invalid "to" field in direct message', msg);
      }

      if (to.node_id === nodeId) {
        // Local delivery
        const targetClient = clientRegistry.getClient(to.conn_id);
        if (!targetClient?.ws?.conn) {
          return fromConn.sendError(`client ${to.conn_id} not found on node ${nodeId}`, msg);
        }

        targetClient.send({
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
          nodeMessages.emit('outbound:client_direct', {
          from: fromConn,
          message: msg
        });
      }
    },

    shutdown: async () => {
      log.info('[clientRouter] Shutdown complete');
    }
  };

  return router;
}

module.exports = { initialize };

