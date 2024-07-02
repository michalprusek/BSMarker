import { defineStore } from 'pinia';
import { experiment_info, update_polygon, create_polygon, delete_polygon, detect } from "./api.js";


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
            await update_polygon(poly.id, poly.data);
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
        }

        /*async modify_image() {
            let { dataUrl, histogram } = await modified_image(this.id, this.frame_idx);
            this.current_frame.image.url = dataUrl;
            this.current_frame.histogram = histogram;
            this.current_frame.image.preloaded = null;
        },*/
    }
});
