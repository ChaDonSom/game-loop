import { ref } from "vue"

export const updateHooks = ref<((deltaTime: number) => void)[]>([])
