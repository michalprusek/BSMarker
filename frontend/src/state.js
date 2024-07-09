import { defineStore } from 'pinia';
import { experiment_info, update_polygon, create_polygon, delete_polygon, detect, detect_free_cells, detect_all, clear_polys } from "./api.js";


function preload_image(src) {
    const image = new Image();
    image.src = src;
    return image;
};


export const useExperimentStore = defineStore("experiment", {
    state: () => {
        return {
        	id: null,
            experiment: null,
            frames: null,
            frame_idx: 0,

            loaded: false,
            highlighted_poly: null,

            shown_version: "original",
        };
    },
    getters: {
        current_frame: (state) => {
            if (!state.frames) {
                return null;
            }
            return state.frames[state.frame_idx];
        },

        offset_frame: (state) => (offset) => {
            const l = state.frames.length;

            return state.frames[(state.frame_idx+offset+l)%l];
        },

        current_histogram: (state) => {
            return state.frames[state.frame_idx][state.shown_version].histogram;
        }
    },
    actions: {
    	async setup() {
    		this.id = JSON.parse(document.getElementById("experiment").textContent);

            // Load experiment data
    		const { frames, ...experiment } = await experiment_info(this.id);
    		this.experiment = experiment;
            this.frames = frames;

            // Preload frames
            /*for (let i = 0; i < this.frames.length; i++) {
                this.frames[i].image.preloaded = preload_image(this.frames[i].image.url);
            }*/

            this.loaded = true;
    	},

        // Frame switching functions
        next_frame() {
            if (!this.frames) {
                throw "invalid operation 'next_frame' at this state";
            }
            this.frame_idx = (this.frame_idx+1)%this.frames.length;
        },
        prev_frame() {
            if (!this.frames) {
                throw "invalid operation 'prev_frame' at this state";
            }
            const l = this.frames.length;
            this.frame_idx = (this.frame_idx-1+l)%l;
        },

        // These actions operate on the current frame
        async save_polygon(idx) {
            const poly = this.current_frame.polygons[idx];
            this.current_frame.polygons[idx] = await update_polygon(poly.id, poly.data, poly.operation);
        },

        async create_polygon() {
            const poly = await create_polygon(this.current_frame.id);
            this.current_frame.polygons.push(poly);
        },

        async delete_polygon(idx) {
            this.highlighted_poly = null;
            await delete_polygon(this.current_frame.polygons[idx].id);
            this.current_frame.polygons.splice(idx, 1);
        },

        async detect() {
            const poly = await detect(this.current_frame.id);
            this.current_frame.polygons.push(poly);
        },

        async detect_free_cells() {
            const polys = await detect_free_cells(this.current_frame.id);
            this.current_frame.polygons.push(...polys);
        },

        async detect_all() {
            window.processing.showModal();
            const frames = await detect_all(this.experiment.id);

            for (let i = 0; i < frames.length; i++) {
                this.frames[i].polygons = frames[i].polygons;
            }
            window.processing.close();
        },

        async clear_polys() {
            if (!confirm("Are you sure you want to delete all polygons in this experiment?")) {
                return;
            }

            const frames = await clear_polys(this.experiment.id);

            for (let i = 0; i < frames.length; i++) {
                this.frames[i].polygons = frames[i].polygons;
            }
        }
    }
});
