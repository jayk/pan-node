/**
 * agentRouter.js
 *
 * Routes incoming agent messages based on type: control, broadcast, or direct.
 *
 * - Control messages are handled by `agentControl`.
 * - Broadcast messages are sent to other local agents and relayed to peers.
 * - Direct messages are sent to a specific connection, locally or to another node.
 *
 * This module acts as the core message router for special agents.
 */

const panApp = require('../panApp');
const { log } = require('../utils/log');
const nodeMessages = require('../utils/nodeMessages');
const agentControl = require('./agentControl');

/**
 * Initializes the agent router and returns the message handling interface.
 *
 * @param {object} config - (Unused) Future config support placeholder.
 * @returns {object} router API
 */
async function initialize(config = {}) {
  const router = {
    /**
     * Main entry point for handling a message from an agent.
     *
     * Routes based on message `type`: control, broadcast, direct.
     *
     * @param {object} conn - The sending connection.
     * @param {object} msg - The message received.
     */
    async handleMessage(conn, msg) {
      if (!msg || typeof msg !== 'object') {
        return;
      }

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

    /**
     * Broadcasts a message to all other agents in the specified group,
     * and emits the message on the bus for cross-node relay.
     *
     * @param {object} fromConn - Connection that sent the broadcast.
     * @param {object} msg - Broadcast message.
     */
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
          if (connId === fromConn.id) {
            continue;
          }

          const target = agentRegistry.getAgent(connId);

          if (target) {
            target.send(msg);
          }
        }
      }

      // Relay to other nodes via async message bus
      nodeMessages.emit('outbound:agent_broadcast', {
        from: {
          node_id: nodeId,
          conn_id: fromConn.id
        },
        message: msg
      });
    },

    /**
     * Sends a direct message to a specific agent, either locally or relayed.
     *
     * @param {object} fromConn - Sender connection.
     * @param {object} msg - Direct message object (must include `to` field).
     */
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
        // Relay to other node via async bus
        nodeMessages.emit('outbound:agent_direct', {
          from: fromConn,
          message: msg
        });
      }
    },

    /**
     * Placeholder shutdown function. Currently just logs.
     */
    shutdown: async () => {
      log.info('[agentRouter] Shutdown complete');
    }
  };

  return router;
}

module.exports = { initialize };
