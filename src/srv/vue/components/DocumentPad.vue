<script setup lang="ts">
import { computed, ref } from 'vue';
import type {I_DocumentEntry} from "../types.js";
import type DbPouchClient from '../DbPouchClient.ts';

const props = defineProps<{
  documentList: I_DocumentEntry[];
  apiClient: DbPouchClient;
}>();

const emit = defineEmits<{
  'documentSelected': [documentID: string];
  'documentListChanged': [];
  'documentRemoved': [documentID: string];
}>();

const showDeleteConfirmDialog = ref(false);
const documentToDelete = ref<string | null>(null);

const confirmDelete = () => {
  if (selectedDocumentID.value) {
    documentToDelete.value = selectedDocumentID.value;
    showDeleteConfirmDialog.value = true;
  }
};

const executeDelete = () => {
  if (documentToDelete.value) {
    emit('documentRemoved', documentToDelete.value);
    selectedDocumentID.value = null;
    showDeleteConfirmDialog.value = false;
    documentToDelete.value = null;
  }
};

const cancelDelete = () => {
  showDeleteConfirmDialog.value = false;
  documentToDelete.value = null;
};

const documents = computed(() => {
  if (!props.documentList)
    return [];
  return props.documentList.map((entry: I_DocumentEntry) => {
    return {id: entry._id, title: entry.title}
  })
});

const selectedDocumentID = ref<string | null>(null);
const showSuccessSnackbar = ref(false);

const selectDocument = (documentID: string | undefined) => {
  if (documentID !== undefined) {
    selectedDocumentID.value = documentID;
    emit('documentSelected', documentID);
  }
};
</script>

<template>
  <div class="d-flex flex-column">
    <div class="document-list-wrapper">
      <v-list class="document-list bg-grey-lighten-4" density="compact">
        <v-list-item
          v-for="document in documents"
          :key="document.id"
          :title="document.title"
          :active="selectedDocumentID !== null && selectedDocumentID === document.id"
          @click="selectDocument(document.id)"
          class="document-list-item"
        ></v-list-item>
      </v-list>
    </div>

    <div class="d-flex justify-end mt-3">
      <v-btn color="error" prepend-icon="mdi-delete" @click="confirmDelete" :disabled="!selectedDocumentID">Remove</v-btn>
    </div>
  </div>

  <v-snackbar
    v-model="showSuccessSnackbar"
    color="success"
    timeout="3000"
  >
    Document created successfully!
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
        Are you sure you want to delete this document? This action cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="cancelDelete">Cancel</v-btn>
        <v-btn color="error" variant="text" @click="executeDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
