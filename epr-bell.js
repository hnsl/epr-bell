#!/usr/bin/env node
var fs = require('fs');
var mustache = require('mustache');
var util = require('./util.js');
var hvts = require('./hvt.js');

// We do 4M simulations per theory with an angular resolution of 32.
var N_SIML = 4e6;
var N_ARES = 32;

// Create a reference result which represents the QM prediction and the actual
// experimental results.
var results = {};
(function() {
    var coincidents = util.newInitArrayFn(N_ARES, 0);
    for (var i = 0; i < N_ARES; i++) {
        var p_angle = (((Math.PI / 2) / N_ARES) / 2) * (i * 2 + 1);
        coincidents[i] = Math.round((N_SIML / N_ARES) * 0.5 * (0.5 + 0.5 * Math.cos(2 * p_angle)));
    }
    results["QM Prediction"] = coincidents;
})();

// Iterate through our hidden variable theories and test them one-by-one.
hvts.forEach(function(hvt) {
    var coincidents = util.newInitArrayFn(N_ARES, 0);
    for (var i = 0; i < N_SIML; i++) {
        // Randomize which crystal generated the photon pair and decide
        // if the polarization angle is vertical or horizontal.
        var p_angle = (util.coinFlipFn()? 0: Math.PI / 2);
        // Now we generate a "hidden state" for each of the photons with our HVT.
        var hidden_state = hvt.entangle(p_angle);
        // We remove some extra loopholes by assuming:
        // "The photons travel 100 kilometers away in different directions
        // and hit their resepective detector with just 1 ns difference making
        // the first event light cone only 30 cm wide. Which photon will hit
        // their polarization filter first and the filters angle is determined
        // by an external non-deterministic signal from an event outside of the
        // entanglement events light cone."
        var d_angle = util.rndFn() * Math.PI / 2;
        var a1 = util.rndFn() * (Math.PI / 2 - d_angle);
        var a2 = a1 + d_angle;
        var angles = (util.coinFlipFn()? [a1, a2]: [a2, a1]);
        var incident = new Array(2);
        (util.coinFlipFn()? [0, 1]: [1, 0]).forEach(function(v) {
            // Run the HVT filter function on the filter angle and hidden state.
            // It should deterime if we get a detection or not.
            incident[v] = hvt.filter(angles[v], hidden_state[v]);
        });
        // Simulate coincidence detection. Detectors behind the filter register
        // the photons and the information is sent via a classic channel and
        // compared.
        if (incident[0] && incident[1]) {
            // Coincidence found! We note the relative angle (delta angle)
            // the coincident was detected for.
            var i_angle = Math.floor(N_ARES * d_angle / (Math.PI / 2));
            coincidents[i_angle]++;
        }
    }
    // Testing HVT done, store coincident results.
    results[hvt.name] = coincidents;
});

// Output experiment results.
var tpl = fs.readFileSync("template.mst", {"encoding": "utf8"});
var output = mustache.render(tpl, {
    N_SIML: N_SIML,
    N_ARES: N_ARES,
    results: JSON.stringify(results)
});
fs.writeFileSync("result.html", output);
