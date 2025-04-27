// node/agent/groupManager.js

const MAX_MSG_TYPES = 100;

async function initialize(config = {}) {
  const groups = new Map(); // groupId → msgType → Set(connIds)
  const agentSubscriptions = new Map(); // connId → groupId → Set(msgTypes)

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

  const leaveGroup = (connId, groupId) => {
    const agentGroupSubs = agentSubscriptions.get(connId);
    const groupMap = groups.get(groupId);

    if (!agentGroupSubs || !groupMap) return;

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

  const getGroupRecipients = (groupId, msgType) => {
    const groupMap = groups.get(groupId);
    return groupMap?.get(msgType) || new Set();
  };

  const getAgentGroups = (connId) => {
    const subs = agentSubscriptions.get(connId);
    return subs ? Array.from(subs.keys()) : [];
  };

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
