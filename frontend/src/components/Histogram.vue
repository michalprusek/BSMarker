<script setup>
    import { computed, onMounted, watch } from 'vue';
    import Plotly from 'plotly.js-dist-min';

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    function cumsum(xs) {
        // https://stackoverflow.com/a/55261098/4898487
        return xs.map((sum => value => sum += value)(0));
    }

    function cdf(hist) {
        let cdf = cumsum(hist);
        const mhist = Math.max(...hist);
        const mcdf = Math.max(...cdf);
        for (let i = 0; i < cdf.length; i++) {
            cdf[i] = cdf[i]*mhist/mcdf;
        }
        return cdf;
    }

    function plot_data() {
        const histogram = state.current_frame.histogram;

        const data = [
            {
                x: [...Array(256).keys()],
                y: histogram,
                type: "bar",
                hoverinfo: "skip",
            },
            {
                x: [...Array(256).keys()],
                y: cdf(histogram),
                type: "line",
                hoverinfo: "skip",
            }
        ];

        Plotly.newPlot("histogram", data, {
            xaxis: {fixedrange: true},
            yaxis: {fixedrange: true},
            margin: {l: 0, r: 0, t: 0, b: 0},
            showlegend: false,
        }, {
            displayModeBar: false,
            responsive: true,
        });
    };

    onMounted(plot_data);
    watch(state, plot_data);
</script>


<template>
    <div id="histogram">
    </div>
</template>

<style scoped>
    #histogram {
        border: 1px solid black;
        aspect-ratio: 1;
    }
</style>