<script setup>
    import { project_stats } from "./api.js";
    import { ref, computed, onMounted } from "vue";
    import Plot from "./components/Plot.vue";

    const project = ref();

    onMounted(async function() {
        const id = JSON.parse(document.getElementById("project").textContent);
        project.value = await project_stats(id);
    });

    const data = computed(() => {
        return project.value.experiments.map((e) => ({
                name: e.name,
                x: [...Array(e.frames.length).keys()],
                y: e.frames.map((f) => f.surface)
            })
        );
    });
</script>

<template>
    <header>
        <h1><a href="/">Wound healing</a></h1>
    </header>
    <main v-if="project">
        <h2>{{ project.name }} – report</h2>
        <div class="content">
            <Plot :data="data" />
        </div>
    </main>
</template>

<style scoped>
    h2 {
        margin-top: 1rem;
        text-align: center;
    }

    .content {
        width: 60vw;
        margin: 0 auto;
    }
</style>
