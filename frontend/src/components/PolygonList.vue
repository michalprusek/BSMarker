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
            <tr 
                v-for="(polygon, index) in state.current_frame.polygons"
                @mouseover="state.highlighted_poly = polygon.id"
                @mouseout="state.highlighted_poly = null"
            >
                <td>Polygon {{ index+1 }}</td>
                <td class="right"><Button @click="state.delete_polygon(index)">Remove</Button></td>
            </tr>
            <tr><td colspan="2"><Button @click="state.create_polygon">Add</Button></td></tr>
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

        padding: 0.5rem 1rem;
        background: var(--secondary-color);

        border-radius: 2px;
    }

    .right {
        text-align: right;
    }

    td:hover {
        color: var(--heading-text-color);
    }
</style>