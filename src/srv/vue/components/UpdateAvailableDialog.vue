<script lang="ts" setup>
import {ref, onMounted} from 'vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  'close': [];
}>();

const currentVersion = ref<string>('');
const latestVersion = ref<string>('');

onMounted(async () => {
  try {
    const response = await fetch('/version/check');
    if (response.ok) {
      const data = await response.json();
      currentVersion.value = data.currentVersion;
      latestVersion.value = data.latestVersion;
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
});

function handleClose() {
  emit('close');
}
</script>

<template>
  <v-dialog v-model="props.show" max-width="400px" persistent>
    <v-card>
      <v-card-title class="text-h5 bg-warning">
        <v-icon start>mdi-update</v-icon>
        Update Available
      </v-card-title>
      <v-card-text class="text-sm-body-2">
        <p>A new version of DocPouch is available!</p>
        <p class="mt-2">
          <strong>Current version:</strong> {{ currentVersion }}<br>
          <strong>Latest version:</strong> {{ latestVersion }}
        </p>
        <p class="mt-2">
          Visit the
          <a href="https://github.com/BFH-JTF/doc-pouch/releases" target="_blank">GitHub releases page</a>
          to download the latest version.
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="elevated" @click="handleClose">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>