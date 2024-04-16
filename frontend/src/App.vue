<script setup>
    import { reactive } from 'vue';
    import ImageDisplay from "./components/ImageDisplay.vue";

    const query = `
query getExperiment($id: ID!) {
  experiment(id: $id) {
    url,
    frames {
      image {
        url
      }
    }
  }
}
`;
    let state = reactive({
        experiment: null
    });

    let experiment_id = JSON.parse(document.getElementById("experiment").textContent);

    fetch("/graphql/", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            query: query,
            operationName: "getExperiment",
            variables: {
                id: experiment_id
            }
        }),
    }).then(res => res.json()).then(res => {
        state.experiment = res.data.experiment;
    });
</script>

<template>
    <nav>
        <h1>Wound healing</h1>
    </nav>
    <main>
        <div class="left split">
            <ImageDisplay v-if="state.experiment" v-bind:frames="state.experiment.frames" />
        </div>
        <div class="right split grid">
            <div class="properties">
                <h3>Mask properties</h3>
            </div>
            <div class="image-enhancement">
                <h3>Image enhancement</h3>
                <!--<Bar :data="histogram" :options="chart_options" />-->
            </div>
            <div class="results">
                <h3>Results</h3>
            </div>
        </div>
    </main>
</template>

<style scoped>
    .properties {
        grid-column-start: 1;
        grid-column-end: 2;
    }

    .image-enhancement {
        grid-column-start: 2;
        grid-column-end: 3;
    }

    .results {
        grid-column-start: 1;
        grid-column-end: 3;
    }
</style>
