import { defineStore } from 'pinia';
import { experiment_info, update_polygon, create_polygon, delete_polygons, detect, detect_free_cells, detect_all, clear_polys } from "./api.js";


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

            shown_version: "original",

            adjust: {
                x: [0, 128, 256],
                y: [0, 128, 256]
            },
        };
    },
    getters: {
        current_frame: (state) => {
            if (!state.frames) {
                return null;
            }
            return state.frames[state.frame_idx];
        },

        offset: (state) => (offset) => {
            const l = state.frames.length;
            return (state.frame_idx+offset+l)%l;
        },

        current_image: (state) => {
            return state.frame_image(state.frame_idx);
        },

        frame_image: (state) => (idx) => {
            let version = state.shown_version;
            if (version == "adjusted") {
                version = "original";
            }
            return state.frames[idx][version];
        },

        current_histogram: (state) => {
            return state.current_image.histogram;
        },

        frame_url: (state) => (idx) => {
            let url = new URL(state.frame_image(idx).url, document.location);

            if (state.shown_version == "adjusted") {
                url.searchParams.set("lut_in", JSON.stringify(state.adjust.x));
                url.searchParams.set("lut_out", JSON.stringify(state.adjust.y));
            }
            return url.toString();
        },

        current_url: (state) => {
            return state.frame_url(state.frame_idx);
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

            // Setup local polygon attributes
            for (let i = 0; i < this.frames.length; i++) {
                for (let j = 0; j < this.frames[i].polygons; j++) {
                    this.frames[i].polygons[j].selected = false;
                }
            }

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

        async delete_selected_polygons() {
            let ids = [];
            for (const poly of this.current_frame.polygons) {
                if (poly.selected) {
                    ids.push(poly.id);
                }
            }
            await delete_polygons(ids);
            this.current_frame.polygons = this.current_frame.polygons.filter((p) => !p.selected);
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
