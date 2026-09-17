import { createApp } from "vue"
import App from "./App.vue"
import * as soapboxInit from "@/soapbox-init.ts"
import { initNetwork } from "@/network.ts"

createApp(App).mount("#app")

initNetwork()
