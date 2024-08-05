<script setup>
    import { ref, computed, onMounted, watch, reactive } from 'vue';
    import Plotly from 'plotly.js-dist-min';

    import { useExperimentStore } from "../state.js";
    let state = useExperimentStore();

    const props = defineProps(["histogram", "adjustN"]);

    let hovered = null;
    let drag = null;

    function equispaced_256() {
        return [...Array(props.adjustN).keys()].map((x) => x/(props.adjustN-1) * 256);
    }

    let adjust = reactive({
        x: equispaced_256(),
        y: equispaced_256(),
    });

    watch(() => props.adjustN, () => {
        adjust.x = equispaced_256();
        adjust.y = equispaced_256();
    });

    const plot = ref(null);

    function cumsum(xs) {
        // https://stackoverflow.com/a/55261098/4898487
        return xs.map((sum => value => sum += value)(0));
    }

    function cdf(hist) {
        let cdf = cumsum(hist);
        const mhist = Math.max(...hist);
        const mcdf = Math.max(...cdf);
        for (let i = 0; i < cdf.length; i++) {
            cdf[i] = cdf[i]*mhist/mcdf;
        }
        return cdf;
    }

    function plot_data() {
        let cdf_ = cdf(props.histogram);

        const data = [
            {
                x: [...Array(256).keys()],
                y: props.histogram,
                type: "bar",
                hoverinfo: "skip",
            },
            {
                x: [...Array(256).keys()],
                y: cdf_,
                type: "line",
                hoverinfo: "skip",
            },
        ];

        if (state.shown_version == "adjusted") {
            data.push({
                x: adjust.x,
                y: adjust.y.map((y) => cdf_[cdf_.length-1]/256*y),
                marker: { color: "grey" },
                line: { color: "grey" }, //shape: "spline", 
                hoverinfo: "x",
            });
        }

        Plotly.newPlot("histogram", data, {
            xaxis: { fixedrange: true, showgrid: false },
            yaxis: { fixedrange: true, showgrid: false },
            margin: {l: 0, r: 0, t: 0, b: 0},
            showlegend: false,
            // TODO: unhardcode
            plot_bgcolor: "rgb(24, 28, 37)",
            paper_bgcolor: "rgb(24, 28, 37)"
        }, {
            displayModeBar: false,
            responsive: true,
        });

        plot.value.on("plotly_hover", function(data) {
            hovered = data.points[0].pointNumber;
        });

        plot.value.on("plotly_unhover", function(data) {
            hovered = null;
        });
    };

    onMounted(plot_data);
    watch(state, plot_data);
    watch(adjust, plot_data);

    onMounted(() => {
        window.addEventListener("mousemove", function(event) {
            if (!plot.value) {
                return;
            }
            const rect = plot.value.getBoundingClientRect();
            let x = Math.min(Math.max((event.clientX - rect.left)/rect.width * 256, 0), 256-1e-6);
            let y = Math.min(Math.max(1-(event.clientY - rect.top)/rect.height * 256 + 256, 0), 256-1e-6);

            if (drag) {
                if (drag == 0 || drag == adjust.x.length-1) {
                    return;
                }

                adjust.x[drag] = Math.max(Math.min(x, adjust.x[drag+1]), adjust.x[drag-1]);
                adjust.y[drag] = y;
            }
        });

        plot.value.addEventListener("mousedown", function(event) {
            drag = hovered;
            event.stopPropagation();
            event.preventDefault();
        });

        window.addEventListener("mouseup", function(event) {
            drag = null;

            // A bit of a hack to remove reactivity
            state.adjust = JSON.parse(JSON.stringify(adjust));
        });
    });
</script>


<template>
    <div id="histogram" ref="plot">
    </div>
</template>

<style scoped>
    #histogram {
        aspect-ratio: 1;
        max-width: 20rem;
        margin: 1rem;
    }
</style>