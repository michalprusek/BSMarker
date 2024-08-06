<script setup>
    import Button from "./Button.vue";
    import { ref } from "vue";

    const props = defineProps({
        dialog_id: String,
        closeable: Boolean,
    });
    const dialog = ref();

    function show() {
        dialog.value.showModal();
    }

    defineExpose({
        show,
    });
</script>

<template>
    <dialog :id="props.dialog_id" ref="dialog">
        <Button v-if="props.closeable" style="float: right;" icon="io-close" @click="dialog.close();" />
        <slot />
    </dialog>
</template>

<style scoped v-if="props.closeable">
    dialog {
        min-width: 20vw;
    }
</style>

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
