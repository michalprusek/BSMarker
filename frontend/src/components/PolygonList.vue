<script setup>
    import Button from "./Button.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    function highlight(index) {
        setTimeout(() => {state.highlighted_poly = index}, 0);
    }

    function remove_highlight() {
        setTimeout(() => {state.highlighted_poly = null}, 0);
    }
</script>

<template>
    <table>
        <!--<tr>
            <th>Key</th>
            <th>Type</th>
            <th>Actions</th>
        </tr>-->
        <tr 
            :key="polygon.id"
            v-for="(polygon, index) in state.current_frame.polygons"
            @mouseover="highlight(index)"
            @mouseout="remove_highlight()"
        >
            <td>Polygon {{ index+1 }}</td>
            <td>
                <select @change="state.save_polygon(index)" @keydown.prevent v-model="state.current_frame.polygons[index].operation">
                    <option value="+">+</option>
                    <option value="-">-</option>
                </select>
            </td>
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

    th {
        text-align: left;
    }

    tr:hover td {
        color: var(--heading-text-color);
    }
</style>