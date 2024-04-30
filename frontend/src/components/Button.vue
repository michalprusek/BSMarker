<script setup>
    const props = defineProps(["icon"]);
</script>

<template>
    <button><v-icon v-if="icon" v-bind:name="icon" /><slot /></button>
</template>
