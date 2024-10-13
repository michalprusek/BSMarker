<script setup>
    import ImageDisplay from "./components/ImageDisplay.vue";
    import Histogram from "./components/Histogram.vue";
    import PolygonList from "./components/PolygonList.vue";
    import Button from "./components/Button.vue";
    import Card from "./components/Card.vue";
    import Dialog from "./components/Dialog.vue";
    import Results from "./components/Results.vue";
    import FrameManager from "./components/FrameManager.vue";
    import Loader from "./components/Loader.vue";

    const fm = ref(false);

    import { useExperimentStore } from "./state.js";
    let state = useExperimentStore();
    state.setup();

    import { ref, onMounted } from 'vue';

    const adjustN = ref(3);
    const results = ref();

    function switch_interface() {
        if (fm.value) {
            state.$reset();
            state.setup();
        }
        fm.value = !fm.value;
    }
</script>

<template>
    <Dialog dialog_id="processing">
        Processing...
    </Dialog>

    <Dialog ref="results" closeable>
        <Results />
    </Dialog>

    <header>
        <h1><a href="/">Wound healing</a></h1>

        <span class="menus">
            <Button @click="switch_interface">
                <template v-if="fm">
                    Go to Editor
                </template>
                <template v-else>
                    Go to Frame manager
                </template>
            </Button>
        </span>
    </header>
    <main v-if="fm">
        <Suspense>
            <FrameManager />

            <template #fallback>
                <Loader />
            </template>
        </Suspense>
    </main>
    <main v-else-if="state.loaded && state.frames.length <= 0">
        <Dialog open style="text-align: center;">
            <p>No frames yet in this experiment.</p>
            <p>
                <Button @click="fm = !fm">
                    Go to Frame manager
                </Button>
            </p>
        </Dialog>
    </main>
    <main v-else-if="state.loaded">
        <div class="left split">
            <ImageDisplay v-if="state.frames" />
        </div>
        <div class="right split grid">
            <div class="properties">
                <h3>Mask properties</h3>
                <Card title="Polygons">
                    <PolygonList />
                </Card>
                <Card title="Image detection">
                    <p>
                        <h5>Actions</h5>
                        <Button @click="state.detect_full().then(() => results.show());">Full detect + results</Button>
                        <Button @click="state.clear_polys">Clear all polygons</Button>
                    </p>
                    <p>
                        <h5>Wound detection</h5>
                        <Button @click="state.detect">Detect frame</Button>
                        <Button @click="state.detect_all">Detect all frames</Button>
                    </p>
                    <p>
                        <h5>Free cell detection</h5>
                        <Button @click="state.detect_free_cells">Detect frame</Button>
                        <Button @click="state.detect_free_cells_all">Detect all frames</Button>
                    </p>
                </Card>
            </div>
            <div class="image-enhancement">
                <h3>Image enhancement</h3>
                <Suspense>
                    <Histogram v-if="state.current_frame" :adjust-n="adjustN" />
                </Suspense>
                <table class="image-options">
                    <tr>
                        <td>Show</td>
                        <td>
                            <select @keydown.prevent v-model="state.shown_version">
                                <option value="original">Original</option>
                                <option value="equalized">Equalized histogram</option>
                                <option value="adjusted">Adjusted brightness</option>
                            </select>
                        </td>
                    </tr>
                    <tr v-if="state.shown_version == 'adjusted'">
                        <td>N</td>
                        <td>
                            <input type="number" min="2" v-model="adjustN" />
                        </td> 
                    </tr>
                </table>
            </div>
            <div class="results">
                <h3>Results</h3>
                <Button @click="results.show">
                    Open healing results
                </Button>
                <Card title="This frame">
                    <table>
                        <tr><td>Wound surface</td><td>{{ (100 * state.current_frame.polygons.reduce((s, poly) => s + poly.surface, 0)).toFixed(2) }}%</td></tr>
                        <tr>
                            <td>Selected surface</td>
                            <td>
                                {{ (100 * state.current_frame.polygons.filter((p) => p.selected).reduce((s, poly) => s + poly.surface, 0)).toFixed(2) }}%
                            </td>
                        </tr>
                    </table>
                </Card>
            </div>
        </div>
    </main>
    <main v-else>
        <Loader />
    </main>
</template>

<style scoped>
    .menus {
        float: right;
    }

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

        min-width: 25vw;
    }

    .image-enhancement {
        grid-column-start: 2;
        grid-column-end: 3;
        min-width: 20vw;
    }

    .results {
        grid-column-start: 1;
        grid-column-end: 3;

        overflow: scroll;

        border-top: var(--border-thickness) solid var(--border-color);
    }

    .image-options {
        width: 100%;
    }
</style>
