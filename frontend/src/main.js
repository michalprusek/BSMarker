import 'vite/modulepreload-polyfill';
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { OhVueIcon, addIcons } from "oh-vue-icons";
import { BiSkipBackward, BiSkipForward, BiPlay, BiPause } from "oh-vue-icons/icons";
addIcons(BiSkipBackward, BiSkipForward, BiPlay, BiPause);

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.component("v-icon", OhVueIcon);

app.mount("#app");
