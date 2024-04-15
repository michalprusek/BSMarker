<script setup>
    import { ref, reactive, computed } from 'vue';

    const points = reactive([
        {"id": 1, "x": 0.1, "y": 0.1}, 
        {"id": 2, "x": 0.2, "y": 0.1}, 
        {"id": 3, "x": 0.2, "y": 0.2}, 
        {"id": 4, "x": 0.1, "y": 0.2}
    ]);

    const lines = computed(() => {
        let res = [];

        for (let i = 1; i < points.length; i++) {
            res.push([points[i-1], points[i]]);
        }
        res.push([points[points.length-1], points[0]]);
        return res;
    });

    const svg_polygon_points = computed(() => {
        return points.map(p => p.x + "," + p.y).join(" ");
    });

    const active_drag = ref(null);
    const image_pos = ref(null);

    function set_size() {
        const svg = document.querySelector("#editor-svg")
        const image = document.querySelector("#editor-svg image");
        const svg_rect = svg.getBoundingClientRect();
        const image_rect = image.getBoundingClientRect();
        image_pos.value = {
            width: image_rect.width,
            height: image_rect.height,
            offset_top: image_rect.y-svg_rect.y,
            offset_left: image_rect.x-svg_rect.x,
        }
    }

    function calc_point(event) {
        if (!image_pos.value) {
            set_size();
        }
        const svg = document.getElementById("editor-svg");
        return {
            "x": (event.offsetX-image_pos.value.offset_left)/image_pos.value.width,
            "y": (event.offsetY-image_pos.value.offset_top)/image_pos.value.height
        };
    }

    function add_point(event) {
        let pt = calc_point(event);
        points.splice(parseInt(event.target.dataset.index)+1, 0, {"x": pt.x, "y": pt.y});
    }

    function point_click(event) {
        if (event.target.tagName == "circle") {
            let idx = event.target.dataset.index;

            if (event.button == 2 && points.length > 3) {
                points.splice(idx, 1);
            } else {
                let point = points[idx];
                active_drag.value = point;
            }
        }
    }

    function ctxmenu(event) {
        event.preventDefault();
        return false;
    }

    function drag(event) {
        if (active_drag.value) {
            const svg_pt = calc_point(event);
            active_drag.value.x = svg_pt.x;
            active_drag.value.y = svg_pt.y;
        }
    }

    function drag_end(event) {
        active_drag.value.x = Math.min(Math.max(active_drag.value.x, 0), 1);
        active_drag.value.y = Math.min(Math.max(active_drag.value.y, 0), 1);
        active_drag.value = null;
    }

    window.addEventListener("resize", set_size);
</script>

<template>
    <svg 
        id="editor-svg"
        @contextmenu="ctxmenu"
        @mousedown="point_click" 
        @mousemove="drag" 
        @onmouseleave="drag_end" 
        @mouseup="drag_end" 
        viewBox="0 0 1 1" 
        xmlns="http://www.w3.org/2000/svg"
    >
        <image x="0" y="0" width="1" height="1" xlink:href="/test.jpg"></image>
        <polygon
            v-bind:points="svg_polygon_points"
            fill="rgba(120, 50, 100, 0.2)"
            stroke="rgba(120, 50, 100, 0.7)"
            stroke-width="0.005"
        />
        <line 
            @click="add_point"
            v-for="(line, index) in lines" 
            :key="line[0].id + ',' + line[1].id"
            v-bind:x1="line[0].x" 
            v-bind:y1="line[0].y" 
            v-bind:x2="line[1].x" 
            v-bind:y2="line[1].y"
            stroke="rgba(120, 50, 100, 0.1)"
            stroke-width="0.02"
            v-bind:data-index="index" 
        />
        <circle 
            v-for="(point, index) in points" 
            :key="point.id" 
            r="0.015"
            fill="rgba(120, 50, 100, 0.2)"
            v-bind:cx="point.x" v-bind:cy="point.y"
            v-bind:data-index="index" 
        />
        <circle 
            v-for="(point, index) in points" 
            :key="point.id" 
            r="0.01"
            fill="rgba(120, 50, 100, 0.9)"
            v-bind:cx="point.x" v-bind:cy="point.y"
            v-bind:data-index="index" 
        />
    </svg>
</template>

<style scoped>
    svg {
        height: 100%;
        width: 100%;
    }
</style>