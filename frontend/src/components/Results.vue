<script setup>
    import { ref, onMounted, watch } from 'vue';
    import Button from "./Button.vue";
    import Plotly from 'plotly.js-dist-min';

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const plot = ref();

    function plot_data() {
        if (!state.frames) {
            return;
        }

        let res = [];
        
        for (const frame of state.frames) {
            res.push(100 * frame.polygons.reduce((s, poly) => s + poly.surface, 0));
        }

        const data = [
            {
                x: [...Array(res.length).keys()],
                y: res
            }
        ];

        Plotly.newPlot("results-plot", data, {
            xaxis: { title: "frame" },
            yaxis: { title: "wound size %" },
            automargin: true,
            width: "40vw",
            // TODO: unhardcode
            plot_bgcolor: "rgb(24, 28, 37)",
            paper_bgcolor: "rgb(24, 28, 37)"
        }, {
            responsive: true,
        });
    };

    onMounted(plot_data);
    watch(() => state.frames, plot_data, { deep: true });
</script>

<template>
    <h3>Results</h3>

    <p>
        <a v-if="state.experiment" :href="'/report/' + state.experiment.id + '?format=csv'"><Button icon="bi-filetype-csv"></Button></a>
        <a v-if="state.experiment" :href="'/report/' + state.experiment.id + '?format=xlsx'"><Button icon="bi-filetype-xlsx"></Button></a>
    </p>

    <div id="results-plot" ref="plot">
    </div>
</template>

<style scoped>
    #results-plot {
        margin: 1rem;
        min-width: 40vw;
    }
</style>
