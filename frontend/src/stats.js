import 'vite/modulepreload-polyfill';

import { createApp } from 'vue'
import Stats from './Stats.vue'

import { OhVueIcon, addIcons } from "oh-vue-icons";
import { BiSkipBackwardCircle, BiSkipBackward, BiSkipForward, BiPlay, BiPause, BiBack, BiZoomIn, BiZoomOut, FaDrawPolygon, MdDeleteforeverRound, IoClose, BiFiletypeCsv, BiFiletypeXlsx } from "oh-vue-icons/icons";
addIcons(BiFiletypeCsv, BiFiletypeXlsx);

const app = createApp(Stats);

app.component("v-icon", OhVueIcon);
app.config.performance = true;

app.mount("#app");
