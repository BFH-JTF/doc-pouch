<script lang="ts" setup>
import {computed, ref, watch} from 'vue';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  'close': [value: boolean];
  'logout': [];
}>();

const selectedFile = ref<File | null>(null);
const isUploading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const importScope = ref<'all' | 'users' | 'documents' | 'structures' | 'types'>('all');
const importMode = ref<'replace' | 'add' | 'skip'>('replace');

const importScopeOptions = [
  {title: 'All Data', value: 'all'},
  {title: 'Documents', value: 'documents'},
  {title: 'Users', value: 'users'},
  {title: 'Types', value: 'types'},
  {title: 'Structures', value: 'structures'}
];

const importModeOptions = [
  {title: 'Replace existing documents (same _id)', value: 'replace'},
  {title: 'Add as new documents (new _id)', value: 'add'},
  {title: 'Skip existing documents (same _id)', value: 'skip'}
];

const acceptedFileTypes = computed(() => importScope.value === 'all' ? '.zip,.json' : '.json');
const fileLabel = computed(() => importScope.value === 'all' ? 'Select JSON or ZIP file' : `Select ${importScope.value} JSON file`);

function isValidFileForScope(file: File): boolean {
  const lowerCaseName = file.name.toLowerCase();
  const isJson = lowerCaseName.endsWith('.json') || file.type === 'application/json';
  const isZip = lowerCaseName.endsWith('.zip') || file.type === 'application/zip';

  if (importScope.value === 'all') {
    return isJson || isZip;
  }

  return isJson;
}

function handleCancel() {
  selectedFile.value = null;
  errorMessage.value = '';
  successMessage.value = '';
  isUploading.value = false;
  emit("close", false);
}

function handleFileChange(file: File | File[] | null) {
  const normalizedFile = Array.isArray(file) ? file[0] : file;

  if (!normalizedFile) {
    selectedFile.value = null;
    return;
  }

  if (!isValidFileForScope(normalizedFile)) {
    errorMessage.value = importScope.value === 'all'
        ? 'Please select a valid JSON or ZIP file.'
        : `Please select a valid JSON file for ${importScope.value}.`;
    selectedFile.value = null;
    return;
  }

  selectedFile.value = normalizedFile;
  errorMessage.value = '';
}

async function handleImport() {
  if (!selectedFile.value) {
    errorMessage.value = 'Please select a file to import.';
    return;
  }

  try {
    isUploading.value = true;
    errorMessage.value = '';

    const importUrl = '/database/import';
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('scope', importScope.value);
    formData.append('mode', importMode.value);

    const token = localStorage.getItem('authToken');
    if (!token) {
      errorMessage.value = 'You must be logged in to import the database.';
      isUploading.value = false;
      return;
    }

    const response = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Import failed');
    }

    successMessage.value = importScope.value === 'all'
        ? 'Database imported successfully. You will be logged out.'
        : `${importScope.value} imported successfully. You will be logged out.`;

    setTimeout(() => {
      emit('logout');
      handleCancel();
    }, 2000);
  } catch (error: any) {
    console.error('Error importing database:', error);
    errorMessage.value = `Error importing database: ${error.message}`;
  } finally {
    isUploading.value = false;
  }
}

watch(importScope, () => {
  selectedFile.value = null;
  errorMessage.value = '';
});
</script>

<template>
  <v-dialog v-model="props.show" max-width="500px" persistent>
    <v-card>
      <v-card-title class="text-h5 bg-red-darken-2 text-white">
        Import Database
      </v-card-title>
      <v-card-text class="pt-4">
        <div v-if="!successMessage">
          <v-select
              v-model="importScope"
              :disabled="isUploading"
              :items="importScopeOptions"
              class="mb-2"
              label="Import scope"
          ></v-select>

          <v-select
              v-model="importMode"
              :disabled="isUploading"
              :items="importModeOptions"
              class="mb-2"
              label="Conflict resolution"
          ></v-select>

          <v-file-input
              v-model="selectedFile"
              :disabled="isUploading"
              :error-messages="errorMessage"
              :accept="acceptedFileTypes"
              :label="fileLabel"
              prepend-icon="mdi-database-import"
              @update:model-value="handleFileChange"
          ></v-file-input>

          <p class="text-caption mt-2">
            Scope <code>all</code>: upload a full ZIP backup or a JSON object with collections.
            For single scopes, upload a JSON array (or object containing the selected collection).
          </p>
        </div>

        <v-alert
            v-if="successMessage"
            type="success"
            variant="tonal"
        >
          {{ successMessage }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn
            :disabled="isUploading"
            color="grey-darken-1"
            variant="text"
            @click="handleCancel"
        >
          Cancel
        </v-btn>
        <v-btn
            v-if="!successMessage"
            :disabled="!selectedFile || isUploading"
            :loading="isUploading"
            color="red-darken-1"
            variant="elevated"
            @click="handleImport"
        >
          Import
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
