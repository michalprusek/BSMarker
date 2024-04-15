import 'vite/modulepreload-polyfill';

import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'

import { OhVueIcon, addIcons } from "oh-vue-icons";
import { BiSkipBackward, BiSkipForward, BiPlay } from "oh-vue-icons/icons";

addIcons(BiSkipBackward, BiSkipForward, BiPlay);

const app = createApp(App);
app.component("v-icon", OhVueIcon);
app.mount("#app");
