<script setup lang="ts">
import {ref, watch} from 'vue';
import packageJson from '../../../../package.json';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  'close': [value: boolean];
}>();

const appVersion = ref(packageJson.version);

async function refreshVersion() {
  try {
    const response = await fetch('/version/check');
    if (response.ok) {
      const data = await response.json();
      if (data.currentVersion) {
        appVersion.value = data.currentVersion;
      }
    }
  } catch {
    // keep bundled fallback version
  }
}

watch(() => props.show, (visible) => {
  if (visible) {
    refreshVersion();
  }
});

function handleOK() {
    emit("close", true);
}

</script>

<template>
  <v-dialog v-model="props.show" persistent max-width="400px">
    <v-card>
      <v-card-title class="text-h5 bg-blue-darken-2">docPouch V{{ appVersion }}</v-card-title>
      <v-card-text class="text-sm-body-2">
        <p>DocPouch is a lightweight, document-based database with user management, designed for development and testing
          environments.</p>
        <p class="mt-2">
          Key Features:<br>
          Simple storage of structured documents in JSON format.<br>
          User management capabilities.<br>
          RESTful API for easy integration.<br>
          File and text-based, prioritizing simplicity over performance.<br>
        </p>
        <p class="mt-2">
          client version: {{ packageJson.dependencies['docpouch-client'] }}<br>
          <a href="https://github.com/BFH-JTF/doc-pouch" target="_blank">DocPouch Github</a><br>
          <a href="https://github.com/BFH-JTF/docpouch-client" target="_blank">DocPouch Client Github</a>
        </p>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" variant="elevated" @click="handleOK">OK</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
