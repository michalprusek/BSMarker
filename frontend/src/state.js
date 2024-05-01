import { watch } from 'vue';
import { defineStore } from 'pinia';
import { experiment_info, modified_image, update_polygon, create_polygon } from "./api.js";


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
        };
    },
    getters: {
        current_frame: (state) => {
            if (!state.frames) {
                return null;
            }
            return state.frames[state.frame_idx];
        },
        // TODO: more generic
        next_url: (state) => {
            if (!state.frames) {
                return null;
            }
            return state.frames[(state.frame_idx+1)%state.frames.length].image.url;
        },
        prev_url: (state) => {
            if (!state.frames) {
                return null;
            }
            const l = state.frames.length;
            return state.frames[(state.frame_idx-1+l)%l].image.url;
        },
    },
    actions: {
    	async setup() {
    		this.id = JSON.parse(document.getElementById("experiment").textContent);

            // Load experiment data
    		const { frames, ...experiment } = await experiment_info(this.id);
    		this.experiment = experiment;
            this.frames = frames;

            // Preload frames
            for (let i = 0; i < this.frames.length; i++) {
                this.frames[i].image.preloaded = preload_image(this.frames[i].image.url);
            }

            this.loaded = true;
    	},

        // Frame switching functions
        next_frame() {
            if (!this.frames) {
                throw "invalid operation 'next_frame' at this state";
            }
            this.frame_idx = (this.frame_idx+1)%this.frames.length;

            if (!this.current_frame.histogram) {
                this.load_histograms(this.frame_idx);
            }
        },
        prev_frame() {
            if (!this.frames) {
                throw "invalid operation 'prev_frame' at this state";
            }
            const l = this.frames.length;
            this.frame_idx = (this.frame_idx-1+l)%l;

            if (!this.current_frame.histogram) {
                this.load_histograms(this.frame_idx);
            }
        },

        // These actions operate on the current frame
        async modify_image() {
            let { dataUrl, histogram } = await modified_image(this.id, this.frame_idx);
            this.current_frame.image.url = dataUrl;
            this.current_frame.histogram = histogram;
            this.current_frame.image.preloaded = null;
        },
        
        async save_polygon(idx) {
            const poly = this.current_frame.polygons[idx];
            await update_polygon(poly.id, poly.data);
        },

        async new_polygon() {
            const poly = await create_polygon(this.current_frame.id);
            console.log(poly);
            this.current_frame.polygons.push(poly);
        }
    }
});