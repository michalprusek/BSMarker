<script setup>
    import { ref } from "vue";
    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
    import KeyboardEvents from "./KeyboardEvents.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const editor_svg = ref(null);

    const FRAME_INTERVAL = 100;

    let paused = ref(true);
    let play_handle = null;

    function play() {
        paused.value = !paused.value;
        play_handle = setInterval(right, FRAME_INTERVAL);
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
</script>

<template>
    <KeyboardEvents @keyup="move" />
    <div class="image-display">
        <div class="blank">
        </div>
        <div class="image-view">
            <svg v-if="state.current_frame" id="editor-svg" ref="editor_svg" viewBox="0 0 1 1" xmlns="http://www.w3.org/2000/svg">
                <image x="0" y="0" width="1" height="1" :xlink:href="state.current_frame.image.url"></image>
                <Polygon 
                    v-if="editor_svg" 
                    v-for="(polygon, index) in state.current_frame.polygons" 
                    @change="state.save_polygon(index)"
                    :points="polygon.data" 
                    :svg="editor_svg"
                    :poly="index" />
            </svg>
        </div>
        <div class="controls">
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
    }

    .controls {
        text-align: center;
    }

    .frame-info input {
        width: 5em;
    }

    .frame-info {
        margin-right: 1rem;
    }

    svg {
        height: 100%;
        width: 100%;
    }
</style>