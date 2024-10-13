<template>
    <div class="loading">
        Loading…
        <div class="loader"></div>
    </div>
</template>

<style scoped>
    .loading {
        padding: 1rem;
        width: 10rem;
        margin: 0 auto;
        text-align: center;
    }

    .loader {
        /*margin-top: 3rem;*/
        margin: 3rem auto;

        width: 4rem;
        height: 4rem;
        border-radius: 50%;
        border: 1rem solid var(--primary-text-color);
        border-bottom-color: transparent;
        animation: load 1s infinite linear;
    }

    @keyframes load {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }
</style>