<script setup>
    import { ref, computed } from 'vue';

    const props = defineProps(["svg", "points", "poly", "pcolor", "highlight"]);
    const emit = defineEmits(["change"])

    const lines = computed(() => {
        let res = [];

        for (let i = 1; i < props.points.length; i++) {
            res.push([props.points[i-1], props.points[i]]);
        }
        res.push([props.points[props.points.length-1], props.points[0]]);
        return res;
    });

    const svg_polygon_points = computed(() => {
        return props.points.map(p => p[0] + "," + p[1]).join(" ");
    });

    const active_drag = ref(null);

    function calc_point(event) {
        const image = props.svg.querySelector("image");
        const rect = image.getBoundingClientRect();

        return {
            "x": (event.clientX - rect.left)/rect.width,
            "y": (event.clientY - rect.top)/rect.height
        };
    }

    function add_point(event) {
        let pt = calc_point(event);
        props.points.splice(parseInt(event.target.dataset.index)+1, 0, [pt.x, pt.y]);
    }

    function point_click(event) {
        if (props.poly == event.target.dataset.poly) {
            let idx = event.target.dataset.index;

            if (event.button == 2 && props.points.length > 3) {
                props.points.splice(idx, 1);
            } else {
                let point = props.points[idx];
                active_drag.value = point;
            }
            event.stopPropagation();
        }
    }

    function ctxmenu(event) {
        event.preventDefault();
        return false;
    }

    function drag(event) {
        if (active_drag.value) {
            const svg_pt = calc_point(event);
            active_drag.value[0] = svg_pt.x;
            active_drag.value[1] = svg_pt.y;
        }
    }

    function drag_end(event) {
        if (active_drag.value) {
            active_drag.value[0] = Math.min(Math.max(active_drag.value[0], 0), 1);
            active_drag.value[1] = Math.min(Math.max(active_drag.value[1], 0), 1);
            active_drag.value = null;
            emit("change");
        }
    }

    props.svg.addEventListener("contextmenu", ctxmenu);
    props.svg.addEventListener("mousemove", drag);
    //props.svg.addEventListener("mouseleave", drag_end);
    props.svg.addEventListener("mouseup", drag_end);
</script>

<template>
    <polygon
        :points="svg_polygon_points"
        :fill="highlight ? 'rgba(var(--poly-color), 0.8)' : 'rgba(var(--poly-color), 0.2)'"
        stroke="rgba(var(--poly-color), 0.7)"
        stroke-width="0.005"
    />
    <line 
        @click="add_point"
        v-for="(line, index) in lines" 
        :key="line[0][0] + ',' + line[0][1] + ':' + line[1][0] + ',' + line[1][1]"
        :x1="line[0][0]" 
        :y1="line[0][1]" 
        :x2="line[1][0]" 
        :y2="line[1][1]"
        stroke="rgba(var(--poly-color), 0.1)"
        stroke-width="0.02"
        :data-index="index" 
        :data-poly="poly"
    />
    <circle 
        @mousedown="point_click"
        v-for="(point, index) in points" 
        :key="point[0] + ',' + point[1]"
        r="0.01"
        fill="rgba(var(--poly-color), 0.9)"
        :cx="point[0]" :cy="point[1]"
        :data-index="index" 
        :data-poly="poly"
    />
    <circle 
        @mousedown="point_click"
        v-for="(point, index) in points" 
        :key="point[0] + ',' + point[1]" 
        r="0.015"
        fill="rgba(var(--poly-color), 0.2)"
        :cx="point[0]" :cy="point[1]"
        :data-index="index" 
        :data-poly="poly"
    />
</template>

<style scoped>
    polygon, line, circle {
        --poly-color: v-bind(pcolor);
    }
</style>