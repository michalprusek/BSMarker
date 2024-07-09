<script setup>
    import ImageDisplay from "./components/ImageDisplay.vue";
    import Histogram from "./components/Histogram.vue"
    import PolygonList from "./components/PolygonList.vue"
    import Button from "./components/Button.vue";
    import Card from "./components/Card.vue";
    import Dialog from "./components/Dialog.vue";

    import { useExperimentStore } from "./state.js";
    let state = useExperimentStore();
    state.setup();
</script>

<template>
    <Dialog dialog_id="processing">
        Processing...
    </Dialog>

    <header>
        <h1><a href="/">Wound healing</a></h1>
    </header>
    <main v-if="state.loaded">
        <div class="left split">
            <ImageDisplay v-if="state.frames" />
        </div>
        <div class="right split grid">
            <div class="properties">
                <h3>Mask properties</h3>
                <Card title="Polygons">
                    <PolygonList />
                </Card>
                <Card title="Wound detection">
                    <Button @click="state.detect">Detect single</Button>
                    <Button @click="state.detect_all">Detect all</Button>
                    <Button @click="state.clear_polys">Clear all</Button>
                </Card>
                <Card title="Cell detection">
                    <Button @click="state.detect_free_cells">Detect free cells</Button>
                </Card>
            </div>
            <div class="image-enhancement">
                <h3>Image enhancement</h3>
                <Histogram v-if="state.current_frame" :histogram="state.current_frame[state.shown_version].histogram" />
                <table class="image-options">
                    <tr>
                        <td>Show</td>
                        <td>
                            <select @keydown.prevent v-model="state.shown_version">
                                <option value="original">Original</option>
                                <option value="equalized">Equalized histogram</option>
                            </select>
                        </td>
                    </tr>
                </table>
            </div>
            <div class="results">
                <h3>Results</h3>
                <table>
                    <tr><td>Surface</td><td>{{ state.current_frame.polygons.reduce((s, poly) => s + poly.surface, 0).toFixed(2) }}px²</td></tr>
                    <tr><td>Boundary roughness</td><td>N/A</td></tr>
                    <tr v-if="state.highlighted_poly != null">
                        <td>Active polygon area</td>
                        <td>
                            {{ state.current_frame.polygons[state.highlighted_poly].surface.toFixed(2) }}px²
                        </td>
                    </tr>
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
        min-height: 0;
        max-height: 70vh;
        overflow-y: scroll;
    }

    .image-enhancement {
        grid-column-start: 2;
        grid-column-end: 3;
        min-width: 20vw;
    }

    .results {
        grid-column-start: 1;
        grid-column-end: 3;
        max-height: 10vh;

        border-top: var(--border-thickness) solid var(--border-color);
    }

    .image-options {
        width: 100%;
    }
</style>
