<script setup>
    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
</script>

<template>
    <div class="image-display">
        <Polygon />
        <div class="controls">
            <Button icon="bi-skip-backward" />
            <Button icon="bi-play" />
            <Button icon="bi-skip-forward" />
        </div>
    </div>
</template>

<style scoped>
    .controls {
        height: 10vh;
        width: 100%;
        text-align: center;
    }
</style>