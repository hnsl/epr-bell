var crypto = require('crypto');


var randomBytesFn = function() {
    var rnd_cache = null;
    return function(n) {
        var ret = new Array(n);
        if (!rnd_cache || rnd_cache.offset + n > rnd_cache.data.length) {
            // Refill cache.
            var CACHE_SIZE = 4096 * 2;
            rnd_cache = {
                data: crypto.randomBytes(CACHE_SIZE),
                offset: 0
            };
        }
        for (var i = 0; i < n; i++) {
            ret[i] = rnd_cache.data[rnd_cache.offset + i];
        }
        rnd_cache.offset += n;
        return ret;
    };
}();

// Really non-deterministic (cryptographic) randomness.
// Returns a floating point number in the range [0-1) exactly like Math.random().
module.exports.rndFn = function() {
    var r = randomBytesFn(8);
    var d = 0.0;
    for (var i = 0; i < 8; i++) {
        d += r[i] * Math.pow(2, i * 8);
    }
    return d / Math.pow(2, 8 * 8);
};

// Faster coin flip than (rndFn() < 0.5).
module.exports.coinFlipFn = function() {
    return randomBytesFn(1)[0] < 128;
};

// Returns a new array with specified length and initialized value.
module.exports.newInitArrayFn = function(n, v) {
    return Array.apply(null, new Array(n)).map(function() {
        // Deep clone the value to initialize with.
        return JSON.parse(JSON.stringify(v));
    });
};
