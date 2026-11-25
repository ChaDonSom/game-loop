<script setup lang="ts">
defineProps<{
  connectionStatus: string
}>()
</script>

<template>
  <span class="chip" :class="connectionStatus === 'connected' ? 'ok' : 'down'">
    <slot />
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  min-width: 1.5em;
  justify-content: center;
  padding: 2px 8px;
  border-radius: 999px;
  font:
    600 12px/1.4 system-ui,
    sans-serif;
  color: white;
}
.ok {
  background: green;
}
.down {
  background: red;
}
</style>
