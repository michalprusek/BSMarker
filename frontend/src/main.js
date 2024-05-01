import 'vite/modulepreload-polyfill';
import './assets/app.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { OhVueIcon, addIcons } from "oh-vue-icons";
import { BiSkipBackwardCircle, BiSkipBackward, BiSkipForward, BiPlay, BiPause, BiBack, BiZoomIn, BiZoomOut } from "oh-vue-icons/icons";
addIcons(BiSkipBackwardCircle, BiSkipBackward, BiSkipForward, BiPlay, BiPause, BiBack, BiZoomIn, BiZoomOut);

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

app.component("v-icon", OhVueIcon);
app.config.performance = true;

app.mount("#app");
