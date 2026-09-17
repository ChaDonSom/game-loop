<script setup lang="ts">
import StatusChip from "@/components/StatusChip.vue"
import { connectionStatus, myVisitorId } from "@/store/network"
</script>

<template>
  <div>
    <StatusChip :connection-status="connectionStatus"> My visitor id: {{ myVisitorId ?? "—" }} </StatusChip>
  </div>
</template>
