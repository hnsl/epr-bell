var crypto = require('crypto');

// Really non-deterministic (cryptographic) randomness.
// Returns a floating point number in the range [0-1) exactly like Math.random().
module.exports.rndFn = function() {
    var r = crypto.randomBytes(8);
    var d = 0.0;
    for (var i = 0; i < 8; i++) {
        d += r[i] * Math.pow(2, i * 8);
    }
    return d / Math.pow(2, 8 * 8);
};

// Faster coin flip than (rndFn() < 0.5).
module.exports.coinFlipFn = function() {
    return crypto.randomBytes(1)[0] < 128;
};

// Returns a new array with specified length and initialized value.
module.exports.newInitArrayFn = function(n, v) {
    return Array.apply(null, new Array(n)).map(function() { return v; });
};
