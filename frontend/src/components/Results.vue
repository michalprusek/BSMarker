<script setup>
    import { ref, onMounted, watch } from 'vue';
    import Button from "./Button.vue";
    import Plot from "./Plot.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();
</script>

<template>
    <h3>Results</h3>

    <p>
        <a v-if="state.experiment" :href="'/report/experiment/' + state.experiment.id + '?format=csv'"><Button icon="bi-filetype-csv"></Button></a>
        <a v-if="state.experiment" :href="'/report/experiment/' + state.experiment.id + '?format=xlsx'"><Button icon="bi-filetype-xlsx"></Button></a>
    </p>

    <Plot v-if="state.frames" :data="state.plot" />
</template>
