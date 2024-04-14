<script setup>
    import ImageDisplay from "./components/ImageDisplay.vue";
</script>

<template>
    <nav>
        <h1>Wound healing</h1>
    </nav>
    <main>
        <aside class="split">
            <ImageDisplay />
        </aside>
        <aside class="split">
            <div class="histogram">
                <!--<Bar :data="histogram" :options="chart_options" />-->
            </div>
        </aside>
    </main>
</template>
