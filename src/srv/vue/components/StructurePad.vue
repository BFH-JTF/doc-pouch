<script setup lang="ts">
import { computed, ref } from 'vue';
import type {I_DataStructure} from "docpouch-client";
import type DbPouchClient from 'docpouch-client';

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

// Filter states
const nameFilter = ref('');
const showDeleteConfirmDialog = ref(false);
const structureToDelete = ref<string | null>(null);

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return nameFilter.value !== '';
});

// Clear all filters
const clearFilters = () => {
  nameFilter.value = '';
};

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

// Enhanced filtered structures
const filteredStructures = computed(() => {
  if (!props.structurelist) return [];

  let result = props.structurelist;

  // Apply name filter
  if (nameFilter.value) {
    result = result.filter(structure =>
        structure.name.toLowerCase().includes(nameFilter.value.toLowerCase())
    );
  }

  // Map to display format and sort by name
  return result.map((entry: I_DataStructure) => {
    return {id: entry._id, title: entry.name}
  }).sort((a, b) => a.title.localeCompare(b.title));
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
    <!-- Filter Section -->
    <v-card class="mb-3" variant="outlined">
      <v-card-title class="text-subtitle-1 pa-3">
        <v-icon class="mr-2" icon="mdi-filter"></v-icon>
        Filters
        <v-spacer></v-spacer>
        <v-btn
            v-if="hasActiveFilters"
            color="primary"
            prepend-icon="mdi-filter-remove"
            size="small"
            variant="text"
            @click="clearFilters"
        >
          Clear
        </v-btn>
      </v-card-title>
      <v-card-text class="pa-3 pt-0">
        <v-row no-gutters>
          <v-col cols="12">
            <v-text-field
                v-model="nameFilter"
                clearable
                density="compact"
                hide-details
                label="Filter by structure name"
                prepend-inner-icon="mdi-table"
                variant="outlined"
            ></v-text-field>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <div class="structure-list-wrapper">
      <v-list class="structure-list bg-grey-lighten-4" density="compact">
        <v-list-item
            v-for="structure in filteredStructures"
          :key="structure.id"
          :title="structure.title"
          :active="selectedStructureID !== null && selectedStructureID === structure.id"
          @click="selectStructure(structure.id)"
          class="structure-list-item"
        >
          <template v-slot:prepend>
            <v-avatar color="primary" size="32">
              <v-icon icon="mdi-table"></v-icon>
            </v-avatar>
          </template>
        </v-list-item>

        <!-- Empty state when no structures match filters -->
        <v-list-item v-if="filteredStructures.length === 0 && hasActiveFilters">
          <v-list-item-title class="text-center text-grey">
            <v-icon class="mr-2" icon="mdi-file-search"></v-icon>
            No structures match the current filters
          </v-list-item-title>
        </v-list-item>

        <!-- Empty state when no structures exist -->
        <v-list-item
            v-if="filteredStructures.length === 0 && !hasActiveFilters && (!props.structurelist || props.structurelist.length === 0)"
            class="text-center pa-3 text-disabled">
          <v-icon icon="mdi-information-outline" class="mb-2"></v-icon>
          <div>No data structures defined. An administrator must create structures before documents can be added.</div>
        </v-list-item>
      </v-list>
    </div>

    <div v-if="isAdmin" class="d-flex justify-end mt-3">
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

<style scoped>
.structure-list-wrapper {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.structure-list {
  border-radius: 4px;
}

.structure-list-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.structure-list-item:last-child {
  border-bottom: none;
}
</style>