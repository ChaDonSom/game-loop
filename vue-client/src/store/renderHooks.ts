import { ref } from "vue"

export const renderHooks = ref<((interpolation: number) => void)[]>([])
