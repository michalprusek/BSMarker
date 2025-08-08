<script setup>
    import { project_stats } from "./api.js";
    import { ref, computed, onMounted } from "vue";
    import Button from "./components/Button.vue";
    import Plot from "./components/Plot.vue";
    import Loader from "./components/Loader.vue";

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
        <h1><a href="/">BSMarker</a></h1>
    </header>
    <main v-if="project">
        <h2>{{ project.name }} – report</h2>
        <div class="content">
            <p>
                <a :href="'/report/project/' + project.id + '?format=csv'"><Button icon="bi-filetype-csv"></Button></a>
                <a :href="'/report/project/' + project.id + '?format=xlsx'"><Button icon="bi-filetype-xlsx"></Button></a>
            </p>
            <Plot :data="data" />
        </div>
    </main>
    <main v-else>
        <Loader />
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
