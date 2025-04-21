// node/client/groupManager.js

const MAX_MSG_TYPES = 100;

async function initialize(config = {}) {
  const groups = new Map(); // groupId → msgType → Set(connIds)
  const clientSubscriptions = new Map(); // connId → groupId → Set(msgTypes)

  const joinGroup = (connId, groupId, msgTypes) => {
    if (!Array.isArray(msgTypes) || msgTypes.length === 0) {
      throw new Error('msgTypes must be a non-empty array');
    }

    if (!groups.has(groupId)) {
      groups.set(groupId, new Map());
    }

    if (!clientSubscriptions.has(connId)) {
      clientSubscriptions.set(connId, new Map());
    }

    const groupMap = groups.get(groupId);
    const clientGroupSubs = clientSubscriptions.get(connId);

    if (!clientGroupSubs.has(groupId)) {
      clientGroupSubs.set(groupId, new Set());
    }

    const existingTypes = clientGroupSubs.get(groupId);
    msgTypes.forEach((msgType) => {
      if (!groupMap.has(msgType)) {
        groupMap.set(msgType, new Set());
      }
      groupMap.get(msgType).add(connId);
      existingTypes.add(msgType);
    });

    if (existingTypes.size > MAX_MSG_TYPES) {
      throw new Error('Exceeded max 100 msg_types for this client in this group');
    }
  };

  const leaveGroup = (connId, groupId) => {
    const clientGroupSubs = clientSubscriptions.get(connId);
    const groupMap = groups.get(groupId);

    if (!clientGroupSubs || !groupMap) return;

    const msgTypes = clientGroupSubs.get(groupId);
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
      clientGroupSubs.delete(groupId);
    }

    if (groupMap.size === 0) {
      groups.delete(groupId);
    }

    if (clientGroupSubs.size === 0) {
      clientSubscriptions.delete(connId);
    }
  };

  const getGroupRecipients = (groupId, msgType) => {
    const groupMap = groups.get(groupId);
    return groupMap?.get(msgType) || new Set();
  };

  const getClientGroups = (connId) => {
    const subs = clientSubscriptions.get(connId);
    return subs ? Array.from(subs.keys()) : [];
  };

  const removeClientFromAllGroups = (connId) => {
    const groupIds = getClientGroups(connId);
    for (const groupId of groupIds) {
      leaveGroup(connId, groupId);
    }
  };

  return {
    joinGroup,
    leaveGroup,
    getGroupRecipients,
    getClientGroups,
    removeClientFromAllGroups,
    shutdown: async () => {
      groups.clear();
      clientSubscriptions.clear();
    }
  };
}

module.exports = { initialize };
