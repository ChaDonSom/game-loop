<script setup lang="ts">
import StatusChip from "@/components/StatusChip.vue"
import { connectionStatus, serverCount } from "@/store/network"
</script>

<template>
  <div>
    <StatusChip :connection-status="connectionStatus"> Count from server: {{ serverCount ?? "—" }} </StatusChip>
  </div>
</template>
