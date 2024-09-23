import 'vite/modulepreload-polyfill';
import './assets/app.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

import { OhVueIcon, addIcons } from "oh-vue-icons";
import { BiSkipBackwardCircle, BiSkipBackward, BiSkipForward, BiPlay, BiPause, BiBack, BiZoomIn, BiZoomOut, FaDrawPolygon, MdDeleteforeverRound, IoClose, BiFiletypeCsv, BiFiletypeXlsx, MdRefresh } from "oh-vue-icons/icons";
addIcons(BiSkipBackwardCircle, BiSkipBackward, BiSkipForward, BiPlay, BiPause, BiBack, BiZoomIn, BiZoomOut, FaDrawPolygon, MdDeleteforeverRound, IoClose, BiFiletypeCsv, BiFiletypeXlsx, MdRefresh);

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

app.component("v-icon", OhVueIcon);
app.config.performance = true;

app.mount("#app");
