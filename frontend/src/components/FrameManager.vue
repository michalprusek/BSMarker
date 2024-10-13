<script setup>
    import { ref } from "vue";
    import { experiment_info_quick } from "../api.js";
    import Button from "./Button.vue";

    const experiment = await experiment_info_quick(
        JSON.parse(document.getElementById("experiment").textContent)
    );

    const file_field = ref(null);
    const drop_class = ref("");
    const files = ref([]);

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
</script>

<template>
    <div class="manager" @drop.prevent="drop" @dragover.prevent="drop_class = 'dropready'" @dragleave="drop_class = ''" :class="drop_class">
        <p class="instructions" @click="file_field.click()">Drag and drop new frame files or click <u>here</u> to select them.</p>
        <input @change="select_files" ref="file_field" type="file" style="visibility: hidden;" multiple />
        <table v-if="experiment.frames" >
            <tr v-for="frame in experiment.frames" :key="frame.id">
                <td>{{ frame.image.name.replace(/^.*[\\/]/, '') }}</td>
                <td class="done">Stored</td>
                <td></td>
            </tr>
            <tr v-for="(data, idx) in files" :key="index">
                <td>{{ data.file.name }}</td>
                <template v-if="data.state == 'queued'">
                    <td class="queued">Uploading</td>
                    <td></td>
                </template>
                <template v-else-if="data.state == 'done'">
                    <td class="done">Uploaded</td>
                    <td></td>
                </template>
                <template v-else-if="data.state == 'failed'">
                    <td class="failed">Failed</td>
                    <td><Button icon="md-refresh" @click="fetch_file(idx)"></Button></td>
                </template>
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

    tr td {
        border: var(--border-thickness) solid var(--border-color);
        padding: 0.4rem;
    }

    div.manager {
        padding: 1rem 5rem;
        margin: 1rem auto;

        background: var(--secondary-color);
        border-left: var(--border-thickness) solid var(--border-color);
        border-right: var(--border-thickness) solid var(--border-color);

        width: 50vw;
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