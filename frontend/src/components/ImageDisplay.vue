<script setup>
    import { ref, onMounted } from "vue";
    import { SVG_COORD } from "../utils.js";
    import panzoom from "panzoom";

    import Button from "./Button.vue";
    import Polygon from "./Polygon.vue";
    import KeyboardEvents from "./KeyboardEvents.vue";

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const editor_svg = ref(null);
    const image = ref(null);

    const show_polygons = ref(true);

    /* Image playback */
    let paused = ref(true);
    let play_handle = null;

    function play_skip() {
        if (paused.value) {
            return;
        }

        const img = new Image();
        img.src = state.frame_url(state.offset(1));

        const next = () => {
            right();
            requestAnimationFrame(play_skip);
        }

        if (img.complete) {
            next();
        } else {
            img.addEventListener("load", next);
        }
    }

    function play() {
        paused.value = !paused.value;
        requestAnimationFrame(play_skip);
    }

    function pause() {
        paused.value = !paused.value;
    }

    function left() {
        state.prev_frame();
    }

    function right() {
        state.next_frame();
    }

    function move(event) {
        if (event.keyCode == 37) {
            left();
        } else if (event.keyCode == 39) {
            right();
        }
    }

    function set_frame(event) {
        const l = state.frames.length;
        state.frame_idx = (event.target.value-1+l)%l;
    }

    /* Zooming */

    let zoomer;
    let zoom_scale = ref(1);

    onMounted(() => {
        zoomer = panzoom(editor_svg.value, {
            minZoom: 1,
            smoothScroll: false,
            filterKey: function() {
                // Disable arrow keys for panning
                return true;
            }
        });

        zoomer.on("zoom", () => {
            zoom_scale.value = zoomer.getTransform().scale;
        });
    });

    function zoom_reset(event) {
        zoomer.moveTo(0, 0);
        zoomer.zoomAbs(0, 0, 1);
    }

    function zoom_in(event) {
        const rect = editor_svg.value.parentElement.getBoundingClientRect();
        zoomer.zoomTo(rect.width/2, rect.height/2, 2);
    }

    function zoom_out(event) {
        const rect = editor_svg.value.parentElement.getBoundingClientRect();
        zoomer.zoomTo(rect.width/2, rect.height/2, 0.5);
    }

    /* Drag select */
    const select_start_point = ref(null);
    const select_end_point = ref(null);

    function calc_point(event) {
        const image = document.querySelector(".image-view svg image");
        const rect = image.getBoundingClientRect();

        return {
            "x": (event.clientX - rect.left)/rect.width,
            "y": (event.clientY - rect.top)/rect.height
        };
    }

    function select_start(event) {
        select_start_point.value = calc_point(event);
    }

    function select_move(event) {
        select_end_point.value = calc_point(event);
    }

    function point_in_rect(p, r1, r2) {
        let min_x = Math.min(r1.x, r2.x);
        let max_x = Math.max(r1.x, r2.x);
        let min_y = Math.min(r1.y, r2.y);
        let max_y = Math.max(r1.y, r2.y);

        return p.x >= min_x && p.x <= max_x && p.y >= min_y && p.y <= max_y;
    }

    function select_end(event) {
        if (!select_start_point.value || !select_end_point.value) {
            return;
        }

        let polys_to_delete = [];
        for (let i = 0; i < state.current_frame.polygons.length; ++i) {
            state.current_frame.polygons[i].data = state.current_frame.polygons[i].data.filter((pt) => !point_in_rect({x: pt[0], y: pt[1]}, select_start_point.value, select_end_point.value));
            if (state.current_frame.polygons[i].data.length < 3) {
                polys_to_delete.push(state.current_frame.polygons[i].id);
            } else {
                state.save_polygon(i);
            }
        }
        state.delete_polygons(polys_to_delete);

        select_start_point.value = null;
        select_end_point.value = null;
    }
</script>

<template>
    <KeyboardEvents @keyup="move" />
    <div class="image-display">
        <div class="blank">
        </div>
        <div class="image-view">
            <svg v-if="state.current_frame" id="editor-svg" ref="editor_svg" :viewBox="'0 0 ' + SVG_COORD + ' ' + SVG_COORD" xmlns="http://www.w3.org/2000/svg"><!--@click.right="select_start" @mousemove="select_move" @mouseup.right="select_end">-->
                <g>
                    <!-- studied images -->
                    <image 
                        x="0" 
                        y="0" 
                        :width="SVG_COORD" 
                        :height="SVG_COORD" 
                        :xlink:href="'/preview/' + state.experiment.id"
                        ref="image"
                    />

                    <image 
                        x="0" 
                        y="0" 
                        :width="SVG_COORD" 
                        :height="SVG_COORD" 
                        :xlink:href="state.current_url"
                    />
                    <!--:style="state.highlighted_poly ? 'filter: brightness(60%);' : ''"-->
                </g>
                <g mask="url(#subtract)" v-if="show_polygons">
                    <!-- normal polygons -->
                    <template v-if="editor_svg" v-for="(polygon, index) in state.current_frame.polygons">
                        <Polygon v-if="polygon.operation == '+'"
                            :key="polygon.id"
                            @change="state.save_polygon(index)"
                            :points="polygon.data" 
                            :svg="editor_svg"
                            :poly="polygon.id" 
                            :highlight="polygon.selected"
                            :zoom="zoom_scale"
                            pcolor="var(--polygon-purple)"
                        />
                    </template>
                </g>
                <g v-if="show_polygons">
                    <!-- subtracting polygons -->
                    <template v-if="editor_svg" v-for="(polygon, index) in state.current_frame.polygons">
                        <Polygon v-if="polygon.operation == '-'"
                            :key="polygon.id"
                            @change="state.save_polygon(index)"
                            :points="polygon.data" 
                            :svg="editor_svg"
                            :poly="polygon.id" 
                            :highlight="polygon.selected"
                            :zoom="zoom_scale"
                            render="empty"
                            pcolor="var(--polygon-blue)"
                        />
                    </template>
                </g>
                <g>
                    <template 
                        v-if="select_start_point && select_end_point"
                        v-for="sx in [[select_start_point.x, select_end_point.x], [select_end_point.x, select_start_point.x]]"
                    >
                        <rect  
                            v-for="sy in [[select_start_point.y, select_end_point.y], [select_end_point.y, select_start_point.y]]"
                            fill="rgba(var(--polygon-blue), 0.7)"
                            :x="sx[0] * SVG_COORD"
                            :y="sy[0] * SVG_COORD"
                            :width="(sx[1]-sx[0]) * SVG_COORD"
                            :height="(sy[1]-sy[0]) * SVG_COORD"
                        />
                    </template>
                </g>
                <defs v-if="show_polygons">
                    <!-- subtraction polygon mask -->
                    <mask id="subtract">
                        <rect x="0" y="0" :width="SVG_COORD" :height="SVG_COORD" fill="white" />
                        <template v-if="editor_svg" v-for="(polygon, index) in state.current_frame.polygons">
                            <Polygon v-if="polygon.operation == '-'"
                                :key="'mask-' + polygon.id"
                                :points="polygon.data" 
                                :svg="editor_svg"
                                :poly="polygon.id" 
                                :zoom="zoom_scale"
                                render="mask"
                                pcolor="black"
                            />
                        </template>
                    </mask>
                </defs>
            </svg>
        </div>
        <div class="controls">
            <span class="buttons">
                <Button @click="zoom_in" icon="bi-zoom-in" />
                <Button @click="zoom_reset" icon="bi-back" />
                <Button @click="zoom_out" icon="bi-zoom-out" />

                <Button @click="state.frame_idx = 0; zoom_reset()" icon="bi-skip-backward-circle" />
            </span>
            <span class="frame-info">Frame 
                <input 
                    type="number" 
                    @change="set_frame"
                    :value="state.frame_idx+1"
                />
                /{{ state.frames.length }}
            </span>
            <span class="buttons">
                <Button @click="left" icon="bi-skip-backward" />
                <Button @click="play" v-if="paused" icon="bi-play" />
                <Button @click="pause" v-else icon="bi-pause" />
                <Button @click="right" icon="bi-skip-forward" />
                <Button @click="show_polygons = !show_polygons" icon="fa-draw-polygon" />
            </span>.
        </div>
        <div class="blank">
        </div>
    </div>
</template>

<style scoped>
    .image-display {
        height: 100%;
        display: flex;
        flex-direction: column;
        text-align: center;
    }

    .blank {
        flex-grow: 1;
    }

    .image-view {
        max-height: 95%;
        overflow: hidden;
    }

    .controls {
        text-align: center;
    }

    .frame-info input {
        width: 5em;
    }

    .frame-info {
        margin: 0 1rem;
    }

    svg {
        height: 100%;
        width: 100%;
    }

    svg image {
        transition: 100ms;
    }
</style>