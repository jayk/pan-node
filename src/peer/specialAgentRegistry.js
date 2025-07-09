/**
 * specialAgentRegistry.js
 *
 * Tracks connected special agents and their declared capabilities.
 *
 * This module allows registration, lookup, filtering, and removal of special agents.
 * Each agent must declare a type and an array of capabilities.
 * Agents can be queried by ID or by supported capability.
 */

function initialize(config = {}) {
    const agents = new Map();

    /**
     * Registers a special agent by ID, along with its declared type and capabilities.
     *
     * @param {string} agentId - Unique ID for the agent.
     * @param {object} agentInfo - Must include `agentType` and `capabilities` array.
     */
    function registerAgent(agentId, agentInfo) {
        if (!agentInfo.agentType || !Array.isArray(agentInfo.capabilities)) {
            throw new Error('Invalid agentInfo object');
        }

        agents.set(agentId, {
            agentType: agentInfo.agentType,
            capabilities: agentInfo.capabilities,
        });
    }

    /**
     * Removes a registered agent from the registry.
     *
     * @param {string} agentId
     */
    function unregisterAgent(agentId) {
        agents.delete(agentId);
    }

    /**
     * Retrieves the agent info for a given agent ID.
     *
     * @param {string} agentId
     * @returns {object|null}
     */
    function getAgentInfo(agentId) {
        return agents.get(agentId) || null;
    }

    /**
     * Returns an array of all registered agent IDs.
     *
     * @returns {string[]}
     */
    function getAgentIds() {
        return Array.from(agents.keys());
    }

    /**
     * Finds all agent IDs that support a given capability.
     *
     * @param {string} capability
     * @returns {string[]} agentIds
     */
    function findAgentsByCapability(capability) {
        const matches = [];

        for (const [agentId, info] of agents.entries()) {
            if (info.capabilities.includes(capability)) {
                matches.push(agentId);
            }
        }

        return matches;
    }

    /**
     * Returns a shallow list of all registered agents, including their type and capabilities.
     *
     * @returns {object[]} [{ agentId, agentType, capabilities }]
     */
    function listAgents() {
        const result = [];

        for (const [agentId, info] of agents.entries()) {
            result.push({
                agentId,
                agentType: info.agentType,
                capabilities: info.capabilities
            });
        }

        return result;
    }

    /**
     * Clears all registered agents from memory.
     */
    async function shutdown() {
        agents.clear();
    }

    return {
        registerAgent,
        unregisterAgent,
        getAgentInfo,
        findAgentsByCapability,
        listAgents,
        shutdown,
    };
}

module.exports = {
    initialize
};
