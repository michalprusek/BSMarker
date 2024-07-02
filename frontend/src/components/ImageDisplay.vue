<script setup>
    import { ref, onMounted } from "vue";
    import panzoom from "panzoom";

    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
    import KeyboardEvents from "./KeyboardEvents.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const editor_svg = ref(null);
    const images = ref([]);

    /* Image playback */
    let paused = ref(true);
    let play_handle = null;

    const FRAME_INTERVAL = 75;

    function play_skip() {
        const img = new Image();
        img.src = images.value[state.frame_idx].href.animVal;
        if (img.complete) {
            right();
        }
    }

    function play() {
        paused.value = !paused.value;
        play_handle = setInterval(play_skip, FRAME_INTERVAL);
    }

    function pause() {
        paused.value = !paused.value;
        clearInterval(play_handle);
    }

    function left() {
        state.prev_frame();
    }

    function right() {
        state.next_frame();
    }

    function move(event) {
        if (event.keyCode == 37) {
            left();
        } else if (event.keyCode == 39) {
            right();
        }
    }

    function set_frame(event) {
        const l = state.frames.length;
        state.frame_idx = (event.target.value-1+l)%l;
    }

    /* Zooming */

    let zoomer;
    let zoom_scale = ref(1);

    onMounted(() => {
        zoomer = panzoom(editor_svg.value, {
            minZoom: 1,
            smoothScroll: false,
            filterKey: function() {
                // Disable arrow keys for panning
                return true;
            }
        });

        zoomer.on("zoom", () => {
            zoom_scale.value = zoomer.getTransform().scale;
        });
    });

    function zoom_reset(event) {
        zoomer.moveTo(0, 0);
        zoomer.zoomAbs(0, 0, 1);
    }

    function zoom_in(event) {
        const rect = editor_svg.value.parentElement.getBoundingClientRect();
        zoomer.zoomTo(rect.width/2, rect.height/2, 2);
    }

    function zoom_out(event) {
        const rect = editor_svg.value.parentElement.getBoundingClientRect();
        zoomer.zoomTo(rect.width/2, rect.height/2, 0.5);
    }
</script>

<template>
    <KeyboardEvents @keyup="move" />
    <div class="image-display">
        <div class="blank">
        </div>
        <div class="image-view">
            <svg v-if="state.current_frame" id="editor-svg" ref="editor_svg" viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg">
                <image 
                    x="0" 
                    y="0" 
                    width="1" 
                    height="1" 
                    :xlink:href="'/preview/' + state.experiment.id"
                />
                <image 
                    :id="'frame-idx-' + idx"
                    :key="frame.id"
                    v-for="(frame, idx) in state.frames"
                    ref="images"
                    :visibility="frame.id == state.current_frame.id ? 'visible' : 'hidden'"
                    x="0" 
                    y="0" 
                    width="1" 
                    height="1" 
                    :xlink:href="state.current_frame[state.shown_version].url"
                    :style="state.highlighted_poly ? 'filter: brightness(60%);' : ''"
                />
                <Polygon 
                    v-if="editor_svg" 
                    v-for="(polygon, index) in state.current_frame.polygons" 
                    :key="polygon.id"
                    @change="state.save_polygon(index)"
                    :points="polygon.data" 
                    :svg="editor_svg"
                    :poly="polygon.id" 
                    :highlight="state.highlighted_poly == polygon.id"
                    :zoom="zoom_scale"
                    pcolor="var(--polygon-purple)"
                />
            </svg>
        </div>
        <div class="controls">
            <span class="buttons">
                <Button @click="zoom_in" icon="bi-zoom-in" />
                <Button @click="zoom_reset" icon="bi-back" />
                <Button @click="zoom_out" icon="bi-zoom-out" />

                <Button @click="state.frame_idx = 0; zoom_reset()" icon="bi-skip-backward-circle" />
            </span>
            <span class="frame-info">Frame 
                <input 
                    type="number" 
                    @change="set_frame"
                    :value="state.frame_idx+1"
                />
                /{{ state.frames.length }}
            </span>
            <span class="buttons">
                <Button @click="left" icon="bi-skip-backward" />
                <Button @click="play" v-if="paused" icon="bi-play" />
                <Button @click="pause" v-else icon="bi-pause" />
                <Button @click="right" icon="bi-skip-forward" />
            </span>
        </div>
        <div class="blank">
        </div>
    </div>
</template>

<style scoped>
    .image-display {
        height: 100%;
        display: flex;
        flex-direction: column;
        text-align: center;
    }

    .blank {
        flex-grow: 1;
    }

    .image-view {
        max-height: 95%;
        overflow: hidden;
    }

    .controls {
        text-align: center;
    }

    .frame-info input {
        width: 5em;
    }

    .frame-info {
        margin: 0 1rem;
    }

    svg {
        height: 100%;
        width: 100%;
    }

    svg image {
        transition: 100ms;
    }
</style>