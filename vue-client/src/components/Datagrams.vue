<script setup lang="ts">
import { connectionStatus, serverCount } from "@/store/network"
</script>

<template>
  <div>
    <p>Status: {{ connectionStatus }}</p>
    <p>Count from server: {{ serverCount ?? "—" }}</p>
  </div>
</template>
