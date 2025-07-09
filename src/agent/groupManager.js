/**
 * groupManager.js
 *
 * Manages group membership and message subscriptions for agent connections.
 *
 * Each agent can join one or more groups and subscribe to specific message types within those groups.
 * Groups are keyed by groupId, and each group maps message types to sets of connection IDs.
 * Also tracks reverse mapping from agent connection IDs to their subscriptions for efficient cleanup.
 */

const MAX_MSG_TYPES = 100;

/**
 * Initializes the group manager and returns the group management API.
 *
 * @param {object} config - Optional config (unused currently).
 * @returns {object} Group manager interface
 */
async function initialize(config = {}) {
  const groups = new Map(); // groupId → msgType → Set(connIds)

  const agentSubscriptions = new Map(); // connId → groupId → Set(msgTypes)

  /**
   * Registers a connection as a subscriber to specific msgTypes within a group.
   *
   * @param {string} connId - Connection ID of the agent.
   * @param {string} groupId - Group to join.
   * @param {string[]} msgTypes - Message types to subscribe to.
   */
  const joinGroup = (connId, groupId, msgTypes) => {
    if (!Array.isArray(msgTypes) || msgTypes.length === 0) {
      throw new Error('msgTypes must be a non-empty array');
    }

    if (!groups.has(groupId)) {
      groups.set(groupId, new Map());
    }

    if (!agentSubscriptions.has(connId)) {
      agentSubscriptions.set(connId, new Map());
    }

    const groupMap = groups.get(groupId);

    const agentGroupSubs = agentSubscriptions.get(connId);

    if (!agentGroupSubs.has(groupId)) {
      agentGroupSubs.set(groupId, new Set());
    }

    const existingTypes = agentGroupSubs.get(groupId);

    msgTypes.forEach((msgType) => {
      if (!groupMap.has(msgType)) {
        groupMap.set(msgType, new Set());
      }

      groupMap.get(msgType).add(connId);

      existingTypes.add(msgType);
    });

    if (existingTypes.size > MAX_MSG_TYPES) {
      throw new Error('Exceeded max 100 msg_types for this agent in this group');
    }
  };

  /**
   * Removes a connection from a specific group and unsubscribes it from all msgTypes in that group.
   *
   * @param {string} connId
   * @param {string} groupId
   */
  const leaveGroup = (connId, groupId) => {
    const agentGroupSubs = agentSubscriptions.get(connId);

    const groupMap = groups.get(groupId);

    if (!agentGroupSubs || !groupMap) {
      return;
    }

    const msgTypes = agentGroupSubs.get(groupId);

    if (msgTypes) {
      for (const msgType of msgTypes) {
        const set = groupMap.get(msgType);

        if (set) {
          set.delete(connId);

          if (set.size === 0) {
            groupMap.delete(msgType);
          }
        }
      }

      agentGroupSubs.delete(groupId);
    }

    if (groupMap.size === 0) {
      groups.delete(groupId);
    }

    if (agentGroupSubs.size === 0) {
      agentSubscriptions.delete(connId);
    }
  };

  /**
   * Returns the set of connection IDs subscribed to a given group and message type.
   *
   * @param {string} groupId
   * @param {string} msgType
   * @returns {Set<string>} connection IDs
   */
  const getGroupRecipients = (groupId, msgType) => {
    const groupMap = groups.get(groupId);

    return groupMap?.get(msgType) || new Set();
  };

  /**
   * Returns a list of group IDs the given connection is subscribed to.
   *
   * @param {string} connId
   * @returns {string[]} groupIds
   */
  const getAgentGroups = (connId) => {
    const subs = agentSubscriptions.get(connId);

    return subs ? Array.from(subs.keys()) : [];
  };

  /**
   * Removes a connection from all groups it has joined.
   *
   * @param {string} connId
   */
  const removeAgentFromAllGroups = (connId) => {
    const groupIds = getAgentGroups(connId);

    for (const groupId of groupIds) {
      leaveGroup(connId, groupId);
    }
  };

  return {
    joinGroup,
    leaveGroup,
    getGroupRecipients,
    getAgentGroups,
    removeAgentFromAllGroups,
    shutdown: async () => {
      groups.clear();
      agentSubscriptions.clear();
    }
  };
}

module.exports = { initialize };
