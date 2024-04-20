import 'vite/modulepreload-polyfill';
import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { OhVueIcon, addIcons } from "oh-vue-icons";
import { BiSkipBackward, BiSkipForward, BiPlay, BiPause } from "oh-vue-icons/icons";
addIcons(BiSkipBackward, BiSkipForward, BiPlay, BiPause);

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

app.component("v-icon", OhVueIcon);
app.config.performance = true;

app.mount("#app");
