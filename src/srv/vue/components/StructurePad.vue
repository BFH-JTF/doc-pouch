<script setup lang="ts">
import { computed, ref } from 'vue';
import type { I_DataStructure } from "../types.js";
import type DbPouchClient from '../DbPouchClient.ts';

const props = defineProps<{
  structurelist: I_DataStructure[] | undefined;
  apiClient: DbPouchClient;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'structureSelected': [structureID: string];
  'structureListChanged': [];
  'structureRemoved': [structureID: string];
}>();

const showDeleteConfirmDialog = ref(false);
const structureToDelete = ref<string | null>(null);

const confirmDelete = () => {
  if (selectedStructureID.value) {
    structureToDelete.value = selectedStructureID.value;
    showDeleteConfirmDialog.value = true;
  }
};

const executeDelete = () => {
  if (structureToDelete.value) {
    emit('structureRemoved', structureToDelete.value);
    selectedStructureID.value = null;
    showDeleteConfirmDialog.value = false;
    structureToDelete.value = null;
  }
};

const cancelDelete = () => {
  showDeleteConfirmDialog.value = false;
  structureToDelete.value = null;
};

let structures = computed(() => {
  if (!props.structurelist)
    return [];
  return props.structurelist.map((entry: I_DataStructure) => {
    return {id: entry._id, title: entry.name}
  })
});

const selectedStructureID = ref<string | null>(null);
const showSuccessSnackbar = ref(false);

const selectStructure = (structureID: string | undefined) => {
  if (structureID !== undefined) {
    selectedStructureID.value = structureID;
    console.log('StructurePad: Emitting structureSelected with ID:', structureID);
    emit('structureSelected', structureID);
  }
  else
    selectedStructureID.value = null;
};
</script>

<template>
  <div class="d-flex flex-column">
    <v-card-text class="text-caption bg-blue-lighten-5 rounded mb-3">
      Data structures define templates for documents. Each structure contains fields with specific types that determine what kind of data can be stored. Only administrators can modify structures.
    </v-card-text>

    <div class="structure-list-wrapper">
      <v-list class="structure-list bg-grey-lighten-4" density="compact">
        <v-list-item
          v-for="structure in structures"
          :key="structure.id"
          :title="structure.title"
          :active="selectedStructureID !== null && selectedStructureID === structure.id"
          @click="selectStructure(structure.id)"
          class="structure-list-item"
        ></v-list-item>
        <v-list-item v-if="structures.length === 0" class="text-center pa-3 text-disabled">
          <v-icon icon="mdi-information-outline" class="mb-2"></v-icon>
          <div>No data structures defined. An administrator must create structures before documents can be added.</div>
        </v-list-item>
      </v-list>
    </div>

    <div class="d-flex justify-end mt-3">
      <v-btn color="error" prepend-icon="mdi-delete" @click="confirmDelete" :disabled="!selectedStructureID || !props.isAdmin">Remove</v-btn>
    </div>
  </div>

  <v-snackbar
    v-model="showSuccessSnackbar"
    color="success"
    timeout="3000"
  >
    Structure created successfully!
    <template v-slot:actions>
      <v-btn
        variant="text"
        @click="showSuccessSnackbar = false"
      >
        Close
      </v-btn>
    </template>
  </v-snackbar>

  <!-- Add confirmation dialog -->
  <v-dialog v-model="showDeleteConfirmDialog" max-width="400">
    <v-card>
      <v-card-title class="text-h5">Confirm Deletion</v-card-title>
      <v-card-text>
        <v-alert type="warning" variant="tonal" density="compact" class="mb-3">
          Warning: Deleting a data structure may impact documents that use this structure. This action cannot be undone.
        </v-alert>
        Are you sure you want to delete this structure?
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="cancelDelete">Cancel</v-btn>
        <v-btn color="error" variant="text" @click="executeDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>