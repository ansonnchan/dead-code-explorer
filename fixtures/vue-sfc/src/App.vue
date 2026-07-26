<template>
  <main>Dead Code Explorer fixture</main>
</template>

<script setup lang="ts">
import { liveHelper } from "./helper";

console.log(liveHelper());

function unusedVueHelper(): string {
  return "unused";
}
</script>
