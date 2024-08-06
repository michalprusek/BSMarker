<script setup>
    import { ref, watch } from "vue";

    import Button from "./Button.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const all = ref();

    watch(() => state.current_frame.polygons.map((p) => p.selected), () => {
        let some_selected = false;
        let some_deselected = false;
        for (let p of state.current_frame.polygons) {
            if (p.selected) {
                some_selected = true;
            } else {
                some_deselected = true;
            }
        }
        if (some_selected && some_deselected) {
            all.value.indeterminate = true;
        } else {
            all.value.indeterminate = false;
        }
        if (some_selected) {
            all.value.checked = true;
        } else {
            all.value.checked = false;
        }
    });

    function toggle_all(event) {
        for (let p of state.current_frame.polygons) {
            p.selected = event.target.checked;
        }
    }
</script>

<template>
    <table>
        <tr>
            <th><input type="checkbox" ref="all" @change="toggle_all" /></th>
            <th>Name</th>
            <th>Type</th>
        </tr>
        <tr 
            :key="polygon.id"
            v-for="(polygon, index) in state.current_frame.polygons"
        >
            <td><input type="checkbox" v-model="state.current_frame.polygons[index].selected" /></td>
            <td @click="state.current_frame.polygons[index].selected = !state.current_frame.polygons[index].selected">Polygon {{ index+1 }}</td>
            <td>
                <select @change="state.save_polygon(index)" @keydown.prevent v-model="state.current_frame.polygons[index].operation">
                    <option value="+">+</option>
                    <option value="-">-</option>
                </select>
            </td>
        </tr>
        <tr>
            <td colspan="3">
                <Button icon="fa-draw-polygon" @click="state.create_polygon"></Button>
                <Button icon="md-deleteforever-round" @click="state.delete_selected_polygons"></Button>
            </td>
        </tr>
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
</style>