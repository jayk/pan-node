// tests/validatorTest.js
const assert = require('assert');

const {
    validateIncomingAgentMessage,
    validateIncomingAgentMessage,
    validateIncomingPeerMessage
} = require('../utils/validators.js'); // Adjust path as needed

const localNodeId = '12345678-1234-1234-1234-1234567890ab'; // Fake local nodeId for tests

describe('PAN Validators', function() {

    describe('Agent Messages', function() {

        it('should accept a valid direct agent message', function() {
            const msg = {
                type: 'direct',
                msg_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                from: { node_id: localNodeId, conn_id: 'conn123' },
                msg_type: 'chat.message',
                payload: { text: 'hi' },
                ttl: 10,
                to: { node_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff', conn_id: 'conn456' }
            };
            assert.strictEqual(validateIncomingAgentMessage(msg), true);
        });

        it('should reject a direct agent message missing "to"', function() {
            const msg = {
                type: 'direct',
                msg_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                from: { node_id: localNodeId, conn_id: 'conn123' },
                msg_type: 'chat.message',
                payload: { text: 'hi' },
                ttl: 10
                // no to field
            };
            assert.strictEqual(validateIncomingAgentMessage(msg), false);
        });
    });

    describe('Agent Messages', function() {

        it('should accept a valid direct agent message to local node', function() {
            const msg = {
                type: 'direct',
                msg_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                from: { node_id: localNodeId, conn_id: 'connAgent' },
                msg_type: 'internal.update',
                payload: { action: 'refresh' },
                ttl: 1,
                to: { node_id: localNodeId, conn_id: localNodeId }
            };
            assert.strictEqual(validateIncomingAgentMessage(msg, localNodeId), true);
        });

        it('should reject a direct agent message targeting wrong node', function() {
            const msg = {
                type: 'direct',
                msg_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
                from: { node_id: localNodeId, conn_id: 'connAgent' },
                msg_type: 'internal.update',
                payload: { action: 'refresh' },
                ttl: 1,
                to: { node_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', conn_id: 'conn999' }
            };
            assert.strictEqual(validateIncomingAgentMessage(msg, localNodeId), false);
        });

        it('should accept a valid broadcast from agent', function() {
            const msg = {
                type: 'broadcast',
                msg_id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
                from: { node_id: localNodeId, conn_id: 'connAgent' },
                msg_type: 'internal.alert',
                payload: { alert: 'high memory usage' },
                ttl: 1,
                group: localNodeId + ':' + '12345678-1234-1234-1234-1234567890ab'
            };
            assert.strictEqual(validateIncomingAgentMessage(msg, localNodeId), true);
        });
    });

    describe('Peer Messages', function() {

        it('should accept a valid peer_control message', function() {
            const msg = {
                type: 'peer_control',
                msg_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                from: { node_id: localNodeId, conn_id: 'connPeer' },
                msg_type: 'peer.hello',
                payload: { hello: true },
                ttl: 5
            };
            assert.strictEqual(validateIncomingPeerMessage(msg), true);
        });

        it('should reject a peer_control message missing payload', function() {
            const msg = {
                type: 'peer_control',
                msg_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
                from: { node_id: localNodeId, conn_id: 'connPeer' },
                msg_type: 'peer.hello',
                ttl: 5
                // no payload
            };
            assert.strictEqual(validateIncomingPeerMessage(msg), false);
        });
    });

});
