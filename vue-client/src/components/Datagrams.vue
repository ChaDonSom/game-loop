<script setup lang="ts">
import StatusChip from "@/components/StatusChip.vue"
import { connectionStatus, playerCount } from "@/store/network"
</script>

<template>
  <StatusChip :connection-status="connectionStatus" title="Players on the server">
    {{ playerCount ?? "—" }}
  </StatusChip>
</template>
