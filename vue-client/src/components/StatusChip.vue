<script setup lang="ts">
defineProps<{
  connectionStatus: string
}>()
</script>

<template>
  <p
    :style="{
      backgroundColor: connectionStatus === 'connected' ? 'green' : 'red',
      borderRadius: '16px',
      paddingInline: '8px',
      paddingBlock: '4px',
    }"
  >
    <slot />
  </p>
</template>
