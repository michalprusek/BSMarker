<script setup>
    import ImageDisplay from "./components/ImageDisplay.vue";
</script>

<template>
    <nav>
        <h1>Wound healing</h1>
    </nav>
    <main>
        <div class="left split">
            <ImageDisplay />
        </div>
        <div class="right split grid">
            <div class="properties">
                <h3>Mask properties</h3>
            </div>
            <div class="image-enhancement">
                <h3>Image enhancement</h3>
                <!--<Bar :data="histogram" :options="chart_options" />-->
            </div>
            <div class="results">
                <h3>Results</h3>
            </div>
        </div>
    </main>
</template>

<style scoped>
    .properties {
        grid-column-start: 1;
        grid-column-end: 2;
    }

    .image-enhancement {
        grid-column-start: 2;
        grid-column-end: 3;
    }

    .results {
        grid-column-start: 1;
        grid-column-end: 3;
    }
</style>
