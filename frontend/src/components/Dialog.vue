<script setup>
    const props = defineProps(["dialog_id"]);
</script>

<template>
    <dialog :id="props.dialog_id">
        <slot />
    </dialog>
</template>

<style scoped>
    dialog::backdrop {
        background: repeating-linear-gradient(
            45deg,
            rgba(0, 0, 0, 0.2),
            rgba(0, 0, 0, 0.2) 1px,
            rgba(0, 0, 0, 0.3) 1px,
            rgba(0, 0, 0, 0.3) 20px
        );
        backdrop-filter: blur(3px);
    }
</style>
