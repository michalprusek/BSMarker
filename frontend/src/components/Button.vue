<script setup>
    const props = defineProps(["icon"]);
</script>

<template>
    <button><v-icon v-bind:name="icon" /></button>
</template>
