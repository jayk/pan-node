const assert = require('assert');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const uuid = require('uuid');
const jwt = require('jsonwebtoken');

const { startNode, stopNode } = require('../main.js');
const {
    createVouchsafeIdentity,
    createAttestation,
} = require('vouchsafe');

const NULL_ID = '00000000-0000-0000-0000-000000000000';
const TEST_AGENT_PORT = 5295;
const TEST_NODE_PORT = 5874;

describe('Vouchsafe Agent Authentication', function () {
    let alice, bob;
    let trustedFilePath = path.join(__dirname, 'trusted_issuers.json');
    let trustedPeerFilePath = path.join(__dirname, 'trusted_peer_issuers.json');

    before(async function () {
        // Create identities
        alice = await createVouchsafeIdentity('alice');
        bob = await createVouchsafeIdentity('bob');

        // Write trusted_issuers.json (only Alice is trusted)
        const trustConfig = {
            trusted_issuers: {
                [alice.urn]: ["agent-connect"]
            }
        };
        const peerTrustConfig = {
            trusted_issuers: {
            }
        };
        fs.writeFileSync(trustedFilePath, JSON.stringify(trustConfig, null, 2));
        fs.writeFileSync(trustedPeerFilePath, JSON.stringify(peerTrustConfig, null, 2));

        await startNode({
            peer_server: {
                port: TEST_NODE_PORT,
                trusted_peers_config_file: trustedPeerFilePath
            },
            agent_server: {
                port: TEST_AGENT_PORT,
                enable_compression: true, // Enable WebSocket compression
                connect_timeout: 3,
                identity: {
                    identity_file: "data/pan_server.json",
                    server_name: "Jay's Server",
                    welcome_message: "Welcome! Don't be a jerk.",
                    helo_claims: {}
                }

            },
            agent_registry: {},
            agent_router: {},
            group_manager: {},
            agent_auth_manager: {
                order: ['local'],
                max_tries: 1,
                timeout_ms: 3000,
                methods: {
                    local: {
                        type: "local",
                        trusted_agents_config_file: trustedFilePath
                    }
                }
            },
            logging: { level: 'warn' }
        });
    });

    after(async function () {
/*        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
*/
        await stopNode();
        fs.unlinkSync(trustedFilePath);
        fs.unlinkSync(trustedPeerFilePath);
    });

    it('should reject connection with no token', function (done) {
        let ws = new WebSocket(`ws://localhost:${TEST_AGENT_PORT}`);
        let sentAuth = false;

        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'control',
                msg_type: 'helo',
                msg_id: uuid.v4(),
                from: { node_id: NULL_ID, conn_id: NULL_ID },
                ttl: 1,
                payload: {}
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.msg_type === 'helo' && !sentAuth) {
                sentAuth = true;
                ws.send(JSON.stringify({
                    type: 'control',
                    msg_type: 'auth',
                    msg_id: uuid.v4(),
                    from: { node_id: NULL_ID, conn_id: NULL_ID },
                    ttl: 1,
                    payload: {
                        // no token
                    }
                }));
                return;
            }

            assert.strictEqual(msg.msg_type, 'auth.failed');
            assert.match(msg.payload.message, /missing/i);
            ws.close();
            done();
        });

        ws.on('error', (data) => {
            ws.close();
            done();
        });
    });

    it('should reject connection with non-vouchsafe JWT', function (done) {
        let ws = new WebSocket(`ws://localhost:${TEST_AGENT_PORT}`);
        const fakeJwt = jwt.sign({ sub: 'unauthorized' }, 'not-vouchsafe');
        let sentAuth = false;

        ws.on('open', () => {
            ws.send(JSON.stringify({
                type: 'control',
                msg_type: 'helo',
                msg_id: uuid.v4(),
                from: { node_id: NULL_ID, conn_id: NULL_ID },
                ttl: 1,
                payload: {}
            }));
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data);
            if (msg.msg_type === 'helo' && !sentAuth) {
                sentAuth = true;
                ws.send(JSON.stringify({
                    type: 'control',
                    msg_type: 'auth',
                    msg_id: uuid.v4(),
                    from: { node_id: NULL_ID, conn_id: NULL_ID },
                    ttl: 1,
                    payload: {
                        token: fakeJwt
                    }
                }));
                return;
            }

            assert.strictEqual(msg.msg_type, 'auth.failed');
            assert.match(msg.payload.message, /Access Denied/i);
            ws.close();
            done();
        });

        ws.on('error', (data) => {
            ws.close();
            done();
        });
    });

    it('should reject vouchsafe token from untrusted issuer (bob)', async function () {
        const token = await createAttestation(bob.urn, bob.keypair, {
            purpose: 'agent-connect',
            identifier: 'bob'
        });

        await new Promise((resolve, reject) => {
            ws = new WebSocket(`ws://localhost:${TEST_AGENT_PORT}`);
            let sentAuth = false;

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'control',
                    msg_type: 'helo',
                    msg_id: uuid.v4(),
                    from: { node_id: NULL_ID, conn_id: NULL_ID },
                    ttl: 1,
                    payload: {}
                }));
            });

            ws.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.msg_type === 'helo' && !sentAuth) {
                    sentAuth = true;
                    ws.send(JSON.stringify({
                        type: 'control',
                        msg_type: 'auth',
                        msg_id: uuid.v4(),
                        from: { node_id: NULL_ID, conn_id: NULL_ID },
                        ttl: 1,
                        payload: {
                            token
                        }
                    }));
                    return;
                }

                assert.strictEqual(msg.msg_type, 'auth.failed');
                assert.match(msg.payload.message, /Access Denied/i);
                ws.close();
                resolve();
            });

            ws.on('error', (data) => {
                ws.close();
                reject();
            });
        });
    });

    it('should accept vouchsafe token from trusted issuer (alice)', async function () {
        const token = await createAttestation(alice.urn, alice.keypair, {
            purpose: 'agent-connect',
            identifier: 'alice'
        });

        await new Promise((resolve, reject) => {
            ws = new WebSocket(`ws://localhost:${TEST_AGENT_PORT}`);
            let sentAuth = false;

            ws.on('open', () => {
                ws.send(JSON.stringify({
                    type: 'control',
                    msg_type: 'helo',
                    msg_id: uuid.v4(),
                    from: { node_id: NULL_ID, conn_id: NULL_ID },
                    ttl: 1,
                    payload: {}
                }));
            });

            ws.on('message', (data) => {
                const msg = JSON.parse(data);
                if (msg.msg_type === 'helo' && !sentAuth) {
                    sentAuth = true;
                    ws.send(JSON.stringify({
                        type: 'control',
                        msg_type: 'auth',
                        msg_id: uuid.v4(),
                        from: { node_id: NULL_ID, conn_id: NULL_ID },
                        ttl: 1,
                        payload: {
                            token
                        }
                    }));
                    return;
                }

                assert.strictEqual(msg.msg_type, 'auth.ok');
                assert.ok(msg.payload.conn_id);
                assert.ok(msg.payload.node_id);
                ws.close();
                resolve();
            });

            ws.on('error', (data) => {
                ws.close();
                reject();
            });
        });
    });
});
