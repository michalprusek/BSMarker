<script setup>
    import ImageDisplay from "./components/ImageDisplay.vue";
    import Histogram from "./components/Histogram.vue"
    import PolygonList from "./components/PolygonList.vue"
    import Button from "./components/Button.vue";

    import { useExperimentStore } from "./state.js";
    let state = useExperimentStore();
    state.setup();
</script>

<template>
    <header>
        <h1>Wound healing</h1>
    </header>
    <main v-if="state.loaded">
        <div class="left split">
            <ImageDisplay v-if="state.frames" />
        </div>
        <div class="right split grid">
            <div class="properties">
                <h3>Mask properties</h3>
                <PolygonList />
            </div>
            <div class="image-enhancement">
                <h3>Image enhancement</h3>
                <template v-if="state.current_frame">
                    <Histogram v-if="state.current_frame.histogram" />
                    <Button @click="state.modify_image">Equalize histogram</Button>
                </template>
            </div>
            <div class="results">
                <h3>Results</h3>
                <table>
                    <tr><td>Surface</td><td>N/A</td></tr>
                    <tr><td>Boundary roughness</td><td>N/A</td></tr>
                </table>
            </div>
        </div>
    </main>
    <main v-else>
        <div class="loading">
            Loading...
            <div class="loader"></div>
        </div>
    </main>
</template>

<style scoped>
    .split {
        width: 50vw;
    }

    .grid {
        display: grid;
        grid-gap: -1px;
        height: 100%;
    }

    .grid > * {
        padding: 1rem 1.5rem;
        border-left: var(--border-thickness) solid var(--border-color);
    }

    .properties {
        grid-column-start: 1;
        grid-column-end: 2;
    }

    .image-enhancement {
        grid-column-start: 2;
        grid-column-end: 3;
    }

    .results {
        grid-column-start: 1;
        grid-column-end: 3;

        border-top: var(--border-thickness) solid var(--border-color);
    }
</style>
