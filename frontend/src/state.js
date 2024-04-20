import { defineStore } from 'pinia';
import { experiment_info } from "./api.js";

const preload_image = src => 
    new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = resolve
        image.onerror = reject
        image.src = src
    });


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
    },
    actions: {
    	async setup() {
    		this.id = JSON.parse(document.getElementById("experiment").textContent);

    		const { frames, ...experiment } = await experiment_info(this.id);
    		this.experiment = experiment;
            this.frames = frames;

            for (let i = 0; i < frames.length; i++) {
                this.frames[i].image.preloaded = await preload_image(this.frames[i].image.url);
            }

            this.loaded = true;
    	},
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
    }
});