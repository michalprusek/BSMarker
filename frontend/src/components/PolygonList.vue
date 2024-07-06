<script setup>
    import Button from "./Button.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();
</script>

<template>
    <table>
        <tr 
            v-for="(polygon, index) in state.current_frame.polygons"
            @mouseover="state.highlighted_poly = index"
            @mouseout="state.highlighted_poly = null"
        >
            <td>Polygon {{ index+1 }}</td>
            <td class="right"><Button @click="state.delete_polygon(index)">Remove</Button></td>
        </tr>
        <tr><td colspan="2"><Button @click="state.create_polygon">Add</Button></td></tr>
    </table>
</template>

<style scoped>
    table {
        width: 100%;
    }

    .right {
        text-align: right;
    }

    tr:hover td {
        color: var(--heading-text-color);
    }
</style>