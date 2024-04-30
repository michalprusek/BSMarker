<script setup>
    import Button from "./Button.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();
</script>

<template>
    <details open>
        <summary>
            <h4>Polygons</h4>
        </summary>   
        <table>
            <tr v-for="(polygon, index) in state.current_frame.polygons">
                <td>Polygon {{ index+1 }}</td>
                <td class="right"><Button>Remove</Button></td>
            </tr>
            <tr><td colspan="2"><Button>Add</Button></td></tr>
        </table>
    </details>
</template>

<style scoped>
    table {
        width: 100%;
    }

    summary h4 {
        display: inline;
    }

    details {
        margin-top: 0.75rem;
    }

    .right {
        text-align: right;
    }
</style>