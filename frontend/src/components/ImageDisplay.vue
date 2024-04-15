<script setup>
    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
</script>

<template>
    <div class="image-display">
        <div class="blank">
        </div>
        <div class="image-view">
            <Polygon />
        </div>
        <div class="controls">
            <Button icon="bi-skip-backward" />
            <Button icon="bi-play" />
            <Button icon="bi-skip-forward" />
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
</style>