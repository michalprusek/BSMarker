<script setup>
    import { ref } from "vue";
    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
    import KeyboardEvents from "./KeyboardEvents.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

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
            <Polygon v-if="state.current_frame" :frame="state.current_frame" />
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

        background: var(--primary-color);
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
        width: 4em;
    }

    .frame-info {
        margin-right: 1rem;
    }
</style>