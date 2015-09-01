#!/usr/bin/env node
var fs = require('fs');
var util = require('util');
var mustache = require('mustache');
var etc = require('./etc.js');
var hvts = require('./hvt.js');

// Define the number of simulations per theory and angular resolution in the result.
var N_SIML = 4e6;
var N_ARES = 64;
// We use a special lower angular resolution for the E + Smax search. This is
// because the brute fore search for the highest S has a complexity of O(n ^ 4)
// and because we don't get enough data for the (n ^ 2) angle permutations.
var N_SMAX_AR = 16;

// Converts radians to the respective index.
var radtoiFn = function(rad, ang_res) {
    return Math.floor(ang_res * rad / (Math.PI / 2));
};

// Create a reference result which represents the QM prediction and the actual
// experimental results.
var results = {};
(function() {
    var result = new Array(N_ARES);
    for (var i = 0; i < N_ARES; i++) {
        var p_angle = (((Math.PI / 2) / N_ARES) / 2) * (i * 2 + 1);
        result[i] = {
            total_i: (N_SIML / N_ARES) * 2,
            total_ci: (N_SIML / N_ARES),
            bias: 0,
            incidents: (N_SIML / N_ARES),
            coincidents: Math.round((N_SIML / N_ARES) * 0.5 * (0.5 + 0.5 * Math.cos(2 * p_angle)))
        };
    }
    results["QM Prediction"] = {
        result: result,
        s_data: etc.newInitArrayFn(N_SMAX_AR, {
            s_max: undefined,
            s_angles: undefined
        })
    };
})();

// Iterate through our hidden variable theories and test them one-by-one.
hvts.forEach(function(hvt) {
    var e_result = etc.newInitArrayFn(N_SMAX_AR * N_SMAX_AR, {
        total: 0,
        value: 0
    });
    var result = etc.newInitArrayFn(N_ARES, {
        total_i: 0,
        total_ci: 0,
        bias: 0,
        incidents: 0,
        coincidents: 0
    });
    (function() {
        for (var i = 0; i < N_SIML; i++) {
            // Randomize which crystal generated the photon pair and decide
            // if the polarization angle is vertical or horizontal.
            var p_angle = (etc.coinFlipFn()? 0: Math.PI / 2);
            // Now we generate a "hidden state" for each of the photons with our HVT.
            var hidden_state = hvt.entangle(p_angle);
            // We remove some extra loopholes by assuming:
            // "The photons travel 100 kilometers away in different directions
            // and hit their resepective detector with just 1 ns difference making
            // the first event light cone only 30 cm wide. Which photon will hit
            // their polarization filter first and the filters angle is determined
            // by an external non-deterministic signal from an event outside of the
            // entanglement events light cone."
            var d_angle = etc.rndFn() * Math.PI / 2;
            var a1 = etc.rndFn() * (Math.PI / 2 - d_angle);
            var a2 = a1 + d_angle;
            var angles = (etc.coinFlipFn()? [a1, a2]: [a2, a1]);
            var incident = new Array(2);
            (etc.coinFlipFn()? [0, 1]: [1, 0]).forEach(function(v) {
                // Run the HVT filter function on the filter angle and hidden state.
                // It should deterime if we get a detection or not.
                incident[v] = hvt.filter(angles[v], hidden_state[v]);
            });
            // Simulate coincidence detection. Detectors behind the filter register
            // the photons and the information is sent via a classic channel and
            // compared.
            var i_d_angle = radtoiFn(d_angle, N_ARES);
            result[i_d_angle].total_ci++;
            if (incident[0] && incident[1]) {
                // Coincidence found! We note the relative angle (delta angle)
                // the coincident was detected for.
                result[i_d_angle].coincidents++;
            }
            // We also count single incidents and total angle measurements as this
            // is useful to see if the HVT really models QM behavior.
            // Total angle measurements is not possible to measure in the
            // original experiment but can be approximated by assuming a constant
            // flux of photon pairs and does not correlate with polarizer settings.
            [0, 1].forEach(function(v) {
                var i_angle = radtoiFn(angles[v], N_ARES);
                result[i_angle].total_i++;
                if (incident[v]) {
                    result[i_angle].incidents++;
                    result[i_angle].bias += (v == 0? -1: 1);
                }
            });
            // Update E statistics for the measured angles.
            // E(a, b) = Pvv(a, b) + Phh(a, b) - Pvh(a, b) - Phv(a, b)
            // "This incorporates all possible measurement outcomes and"
            // "varies from +1 when the polarizations always agree to −1"
            // "when they always disagree"
            var e_i = radtoiFn(a1, N_SMAX_AR) * N_SMAX_AR + radtoiFn(a2, N_SMAX_AR);
            e_result[e_i].total++;
            e_result[e_i].value += (incident[0] == incident[1]? 1: -1);
        }
    })();
    // Determine if e results have enough data and convert value to probability.
    (function() {
        for (var a1_i = 0; a1_i < N_SMAX_AR; a1_i++)
        for (var a2_i = 0; a2_i < N_SMAX_AR; a2_i++) {
            if (a2_i < a1_i) {
                e_result[e_i] = undefined;
            } else {
                // We don't want too low resolution, otherwise the Smax calculation is compromised.
                var e_i = a1_i * N_SMAX_AR + a2_i;
                var total = e_result[e_i].total;
                if (total < (N_SIML / (N_SMAX_AR * N_SMAX_AR)) / 4) {
                    throw ("angles (" + a1_i + ", " + a2_i + "), (" + e_i + ") has too low resolution (" + total + "), increase N_SIML or decrease N_ARES!");
                }
                e_result[e_i] = e_result[e_i].value / total;
            }
        }
    })();
    // Brute force search after highest S value possible for each angle
    // selected as "a" in S = E(a, b) - E(a, b') + E(a', b) + E(a', b').
    var s_data = new Array(N_SMAX_AR);
    (function() {
        var getE = function(a, b) {
            var a1_i = (a < b)? a: b;
            var a2_i = (a < b)? b: a;
            return e_result[a1_i * N_SMAX_AR + a2_i];
        };
        for (var a_i = 0; a_i < N_SMAX_AR; a_i++) {
            var s_max = Number.NEGATIVE_INFINITY;
            var s_angles = null;
            for (var b_i = 0; b_i < N_SMAX_AR; b_i++)
            for (var ap_i = 0; ap_i < N_SMAX_AR; ap_i++)
            for (var bp_i = 0; bp_i < N_SMAX_AR; bp_i++) {
                var S = getE(a_i, b_i) - getE(a_i, bp_i) + getE(ap_i, b_i) + getE(ap_i, bp_i);
                if (S > s_max) {
                    s_max = S;
                    s_angles = [a_i, b_i, ap_i, bp_i];
                }
            }
            s_data[a_i] = {
                // We don't pretend we have more resolution than N_SMAX_AR.
                s_max: Math.round(s_max * N_SMAX_AR) / N_SMAX_AR,
                s_angles: s_angles
            };
        }
    })();
    // Testing HVT done, store coincident results.
    results[hvt.name] = {
        result: result,
        s_data: s_data
    };
});

//x-dbg/ console.log(util.inspect(results, false, null));
//x-dbg/ process.exit(0);

// Output experiment results.
var tpl = fs.readFileSync("template.mst", {"encoding": "utf8"});
var output = mustache.render(tpl, {
    N_SIML: N_SIML,
    N_ARES: N_ARES,
    N_SMAX_AR: N_SMAX_AR,
    results: JSON.stringify(results)
});
fs.writeFileSync("result.html", output);
