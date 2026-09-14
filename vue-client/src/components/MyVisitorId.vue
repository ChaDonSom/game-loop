<script setup lang="ts">
import { connectionStatus, myVisitorId } from "@/store/network"
</script>

<template>
  <div>
    <p>Status: {{ connectionStatus }}</p>
    <p>My visitor id: {{ myVisitorId ?? "—" }}</p>
  </div>
</template>
