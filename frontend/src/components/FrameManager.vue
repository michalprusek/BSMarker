<script setup>
    import { ref, watch } from "vue";
    import { experiment_info_quick, detect_wound, detect_free_cells, detect_full, clear_polys, delete_frame } from "../api.js";
    import Button from "./Button.vue";

    const experiment = await experiment_info_quick(
        JSON.parse(document.getElementById("experiment").textContent)
    );

    const file_field = ref(null);
    const drop_class = ref("");
    const files = ref([]);

    const selected = ref(Array(experiment.frames.length).fill(false));
    const all = ref();

    const action = ref("detect_full");
    const action_state = ref(Array(experiment.frames.length).fill(""));

    async function fetch_file(idx) {
        let form = new FormData();
        form.append("file", files.value[idx].file);

        let num = 0;
        if (experiment.frames.length > 0) {
            num = experiment.frames[experiment.frames.length-1].number;
        }
        form.append("number", num+idx)

        const res = await fetch(`/upload/${experiment.id}/`, {
            method: "POST",
            headers: {"X-CSRFToken": csrftoken},
            mode: "same-origin",

            body: form,
        });

        if (res.ok) {
            files.value[idx].state = "done";
        } else {
            files.value[idx].state = "failed";
        }
    }

    function process_file(file) {
        if (file.type.match(/image\/.*$/)) {
            files.value.push({ file, state: "queued" });
            const idx = files.value.length-1;

            fetch_file(idx);
        }
    }

    function drop(event) {
        drop_class.value = "";

        if (event.dataTransfer.items) {
            [...event.dataTransfer.items].forEach((item, i) => {
                if (item.kind === "file") {
                    const file = item.getAsFile();
                    process_file(file);
                }
            });
        } else {
            [...event.dataTransfer.files].forEach((file, i) => {
                process_file(file);
            });
        }
    }

    function select_files(event) {
        [...event.target.files].forEach((file, i) => {
            process_file(file);
        });
    }

    function toggle_all(event) {
        selected.value.fill(event.target.checked);
    }

    function run() {
        for (let i = 0; i < selected.value.length; i++) {
            if (selected.value[i]) {
                action_state.value[i] = "queued";

                let request;
                if (action.value == "detect_wound") {
                    request = detect_wound(experiment.frames[i].id);
                } else if (action.value == "detect_free_cells") {
                    request = detect_free_cells(experiment.frames[i].id);
                } else if (action.value == "detect_full") {
                    request = detect_full(experiment.frames[i].id);
                } else if (action.value == "clear_polys") {
                    request = clear_polys(experiment.frames[i].id);
                } else if (action.value == "delete_frame") {
                    request = delete_frame(experiment.frames[i].id);
                }

                request.then(
                    data => {
                        action_state.value[i] = "done";
                    },
                    data => {
                        action_state.value[i] = "failed";
                    }
                );
            }
        }
    }

    watch(selected, () => {
        let some_selected = false;
        let some_deselected = false;
        for (let s of selected.value) {
            if (s) {
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
    }, {deep: true});
</script>

<template>
    <div class="manager" @drop.prevent="drop" @dragover.prevent="drop_class = 'dropready'" @dragleave="drop_class = ''" :class="drop_class">
        <p class="instructions" @click="file_field.click()">Drag and drop new frame files or click <u>here</u> to select them for upload.</p>
        <input @change="select_files" ref="file_field" type="file" style="visibility: hidden;" multiple />

        <p>
            Action on selected frames: 
            <select v-model="action">
                <option value="detect_full">Detect full</option>
                <option value="detect_wound">Detect wound</option>
                <option value="detect_free_cells">Detect free cells</option>
                <option value="clear_polys">Clear polygons</option>
                <option value="delete_frame">Delete frame</option>
            </select>
            <Button @click="run">Run</Button>
        </p>

        <table v-if="experiment.frames">
            <tr>
                <th><input type="checkbox" ref="all" @change="toggle_all" /></th>
                <th>Frame</th>
                <th>Storage state</th>
                <th>Last action</th>
            </tr>
            <tr v-for="(frame, idx) in experiment.frames" :key="frame.id">
                <td><input type="checkbox" v-model="selected[idx]" /></td>
                <td>{{ frame.image.name.replace(/^.*[\\/]/, '') }}</td>
                <td class="done">Stored</td>

                <td v-if="action_state[idx] == 'queued'" class="queued">Queued</td>
                <td v-else-if="action_state[idx] == 'done'" class="done">Done</td>
                <td v-else-if="action_state[idx] == 'failed'" class="failed">Failed</td>
                <td v-else></td>
            </tr>
            <tr v-for="(data, idx) in files" :key="index">
                <td></td>
                <td>{{ data.file.name }}</td>

                <td v-if="data.state == 'queued'" class="queued">Uploading</td>
                <td v-else-if="data.state == 'done'" class="done">Uploaded</td>
                <td v-else-if="data.state == 'failed'" class="failed">Failed <Button icon="md-refresh" @click="fetch_file(idx)"></Button></td>
                <td></td>
            </tr>
        </table>
    </div>
</template>

<style scoped>
    .instructions u {
        text-decoration-color: #0040FF;
    }

    .instructions {
        text-align: center;
        cursor: pointer;
    }

    .done {
        color: #238823;
    }

    .queued {
        color: #ffbf00;
    }

    .failed {
        color: #d2222d;
    }

    table {
        border-collapse: collapse;
        width: 100%;
    }

    tr td, tr th {
        border: var(--border-thickness) solid var(--border-color);
        padding: 0.4rem;
    }

    th:first-child {
        text-align: left;
    }

    div.manager {
        padding: 1rem 5rem;
        margin: 1rem auto;

        background: var(--secondary-color);
        border-left: var(--border-thickness) solid var(--border-color);
        border-right: var(--border-thickness) solid var(--border-color);

        min-width: 50vw;
    }

    .dropready {
        background: repeating-linear-gradient(
            45deg,
            rgba(0, 0, 0, 0.2),
            rgba(0, 0, 0, 0.2) 1px,
            rgba(0, 0, 0, 0.3) 1px,
            rgba(0, 0, 0, 0.3) 20px
        );
    }
</style>