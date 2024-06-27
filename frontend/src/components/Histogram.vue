<script setup>
    import { computed, onMounted, watch } from 'vue';
    import Plotly from 'plotly.js-dist-min';

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const props = defineProps(["histogram"])

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
        const data = [
            {
                x: [...Array(256).keys()],
                y: props.histogram,
                type: "bar",
                hoverinfo: "skip",
            },
            {
                x: [...Array(256).keys()],
                y: cdf(props.histogram),
                type: "line",
                hoverinfo: "skip",
            }
        ];

        Plotly.newPlot("histogram", data, {
            xaxis: { showgrid: false }, // fixedrange: true, 
            yaxis: { fixedrange: true, showgrid: false },
            margin: {l: 0, r: 0, t: 0, b: 0},
            showlegend: false,
            // TODO: unhardcode
            plot_bgcolor: "rgb(24, 28, 37)",
            paper_bgcolor: "rgb(24, 28, 37)"
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
        aspect-ratio: 1;
        max-width: 20rem;
        margin: 1rem;
    }
</style>