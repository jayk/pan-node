// utils/jwt.js
const jwt = require('jsonwebtoken');

function verifyNetworkJWT(token, jwt_config) {
    try {
        let decoded = jwt.verify(token, jwt_config.secret, {
            audience: jwt_config.jwt_audience,
        });
        return { 
            success: true,
            token: decoded
        };
    } catch (e) {
        return { 
            success: false,
            error: e
        };
    }
}

module.exports = {
    verifyNetworkJWT,
};
