<script setup>
    const props = defineProps(["title"]);
</script>

<template>
    <details open>
        <summary>
            <h4>{{ props.title }}</h4>
        </summary>
        <slot />
    </details>
</template>

<style scoped>
    summary h4 {
        display: inline-block;
        margin-bottom: 0.5rem;
    }

    details {
        margin-top: 0.75rem;

        padding: 0.5rem 1rem;
        background: var(--secondary-color);

        border-radius: 2px;
    }
</style>
