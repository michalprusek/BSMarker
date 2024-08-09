<script setup>
    import { ref, onMounted, watch } from 'vue';
    import Plotly from 'plotly.js-dist-min';

    const props = defineProps(["data"])

    const plot = ref();

    function plot_data() {
        Plotly.newPlot(plot.value, props.data, {
            xaxis: { title: "frame" },
            yaxis: { title: "wound size %" },
            automargin: true,
            // TODO: unhardcode
            plot_bgcolor: "rgb(24, 28, 37)",
            paper_bgcolor: "rgb(24, 28, 37)"
        }, {
            responsive: true,
        });
    };

    onMounted(plot_data);
    watch(() => props.data, plot_data, { deep: true });
</script>

<template>
    <div class="plot" ref="plot">
    </div>
</template>

<style scoped>
    .plot {
        margin: 1rem;
        min-width: 40vw;
    }
</style>
