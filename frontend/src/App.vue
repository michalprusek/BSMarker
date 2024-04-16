<script setup>
    import { reactive } from 'vue';
    import ImageDisplay from "./components/ImageDisplay.vue";
    import Histogram from "./components/Histogram.vue"

    const query = `
query getExperiment($id: ID!) {
  experiment(id: $id) {
    url,
    frames {
      histogram,
      image {
        url
      }
    }
  }
}
`;
    let state = reactive({
        experiment: null,
        frame_num: 0,

        current_frame: function() {
            return this.experiment.frames[this.frame_num]
        }
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
            <ImageDisplay v-if="state.experiment" :state="state" />
        </div>
        <div class="right split grid">
            <div class="properties">
                <h3>Mask properties</h3>
                <ul>
                    <li>Property A <input type="checkbox" /></li>
                    <li>Property B <input type="checkbox" /></li>
                </ul>
            </div>
            <div class="image-enhancement">
                <h3>Image enhancement</h3>
                <Histogram v-if="state.experiment" :state="state" />
            </div>
            <div class="results">
                <h3>Results</h3>
                <table>
                    <tr><td>Surface</td><td>N/A</td></tr>
                    <tr><td>Boundary roughness</td><td>N/A</td></tr>
                </table>
            </div>
        </div>
    </main>
</template>

<style scoped>
    .split {
        width: 50vw;
    }

    .grid {
        display: grid;
        gap: 2px;
        height: 100%;
    }

    .grid > * {
        padding: 0.5rem;
        outline: 2px solid var(--text-color);
    }

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
