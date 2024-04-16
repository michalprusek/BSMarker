<script setup>
    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
    import KeyboardEvents from "./KeyboardEvents.vue";

    const props = defineProps(["state"]);
    const state = props.state;

    function left() {
        const l = state.experiment.frames.length;
        state.frame_num = (state.frame_num-1 + l)%l;
    }

    function right() {
        const l = state.experiment.frames.length;
        state.frame_num = (state.frame_num+1)%l;
    }

    function move(event) {
        if (event.keyCode == 37) {
            left();
        } else if (event.keyCode == 39) {
            right();
        }
    }
</script>

<template>
    <KeyboardEvents @keyup="move" />
    <div class="image-display">
        <div class="blank">
        </div>
        <div class="image-view"> 
            <Polygon :frame="state.current_frame()" />
        </div>
        <div class="controls">
            <span class="frame-info">Frame {{ state.frame_num+1 }}/{{ state.experiment.frames.length }}</span>
            <Button @click="left" icon="bi-skip-backward" />
            <Button icon="bi-play" />
            <Button @click="right" icon="bi-skip-forward" />
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

    .frame-info {
        float: left;
    }
</style>