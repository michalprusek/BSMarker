<script setup>
    import { ref, reactive, computed } from 'vue';

    const points = reactive([
    	{'x': 0.1, 'y': 0.1}, 
    	{'x': 0.2, 'y': 0.1}, 
    	{'x': 0.2, 'y': 0.2}, 
    	{'x': 0.1, 'y': 0.2}
    ]);

	const svg_polygon_points = computed(() => {
		return points.map(p => p.x + "," + p.y).join(" ");
	});

	const active_drag = ref(null);

	function calc_point(event) {
		const svg = document.getElementsByTagName("svg")[0];
		const pt = svg.createSVGPoint();
		pt.x = event.offsetX;
		pt.y = event.offsetY;
		return pt.matrixTransform(svg.getScreenCTM().inverse());
	}

	function drag_start(event) {
		if (event.target.tagName == "circle") {
			let point = points[event.target.dataset.index];
			active_drag.value = point;
		}
	}

	function drag(event) {
		if (active_drag) {
			const svg_pt = calc_point(event);
			active_drag.value.x = svg_pt.x;
			active_drag.value.y = svg_pt.y;
		}
	}

	function drag_end(event) {
		active_drag.value = null;
	}
</script>

<template>
	<svg 
		@mousedown="drag_start" 
		@mousemove="drag" 
		@onmouseleave="drag_end" 
		@mouseup="drag_end" 
		viewBox="0 0 1 1" 
		width="100%"
		xmlns="http://www.w3.org/2000/svg"
	>
		<image x="0" y="0" width="1" height="1" xlink:href="/test.jpg"></image>
		<polygon
			@click="add_point"
			v-bind:points="svg_polygon_points"
			fill="rgba(120, 50, 100, 0.2)"
			stroke="rgb(120, 50, 100)"
			stroke-width="0.005"
		/>
		<circle v-bind:data-index="index" v-for="(point, index) in points" r="0.01" v-bind:cx="point.x" v-bind:cy="point.y" fill="rgb(120, 50, 100)" :key="index" />
	</svg>
</template>

<style scoped>
</style>