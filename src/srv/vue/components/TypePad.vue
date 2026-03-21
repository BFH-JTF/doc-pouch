<script setup lang="ts">
import {ref, computed} from 'vue';
import type {I_DocumentType, I_StructureEntry} from "docpouch-client";
import TypeCreationDialog from './TypeCreationDialog.vue';
import type DbPouchClient from 'docpouch-client';

const props = defineProps<{
  typeList: I_DocumentType[];
  structureList: I_StructureEntry[];
  apiClient: DbPouchClient;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'typeSelectedID': [type: string];
  'typeListChanged': [];
}>();

// Filter states
const nameFilter = ref('');
const showDeleteConfirmDialog = ref(false);
const showCreationDialog = ref(false);
const selectedTypeID = ref<string | null>(null);

const confirmDelete = () => {
  if (selectedTypeID.value) {
    showDeleteConfirmDialog.value = true;
  }
};

const cancelDelete = () => {
  showDeleteConfirmDialog.value = false;
  selectedTypeID.value = null;
};

const cancelCreation = () => {
  showCreationDialog.value = false;
};

const handleTypeDeleted = async () => {
  if (selectedTypeID.value && props.apiClient) {
    try {
      await props.apiClient.removeType(selectedTypeID.value);
      emit('typeListChanged');
      showDeleteConfirmDialog.value = false;
      selectedTypeID.value = null;
    } catch (error) {
      console.error("Error deleting document type:", error);
    }
  }
};

const selectType = (id: string) => {
  emit('typeSelectedID', id);
  selectedTypeID.value = id;
};

function handleTypeCreated(newType: I_DocumentType) {
  try {
    props.apiClient.createType(newType).then(res => {
      emit('typeListChanged');
      showCreationDialog.value = false;
      if (res._id)
        selectedTypeID.value = res._id;
    });
  } catch (e) {
    console.error("Error creating document type:", e);
  }
}

// Enhanced filtering
const filteredTypes = computed(() => {
  if (!props.typeList) return [];

  let filteredList = props.typeList.sort((a, b) => a.name.localeCompare(b.name));

  // Apply name filter
  if (nameFilter.value) {
    filteredList = filteredList.filter(type =>
        type.name.toLowerCase().includes(nameFilter.value.toLowerCase())
    );
  }

  return filteredList;
});

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return nameFilter.value !== '';
});

// Clear all filters
const clearFilters = () => {
  nameFilter.value = '';
};
</script>

<template>
  <v-card>
    <v-card-text>
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
                  label="Filter by type name"
                  prepend-inner-icon="mdi-format-list-bulleted-type"
                  variant="outlined"
              ></v-text-field>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Type List -->
      <div class="type-list-wrapper">
        <v-list class="type-list bg-grey-lighten-4" density="compact">
          <v-list-item
              v-for="type in filteredTypes"
              :key="type._id"
              :active="selectedTypeID !== null && selectedTypeID === type._id"
              @click="selectType(type._id!)"
              class="type-list-item"
          >
            <template v-slot:prepend>
              <v-avatar color="primary" size="32">
                <v-icon icon="mdi-format-list-bulleted-type"></v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>{{ type.name }}</v-list-item-title>
            <v-list-item-subtitle>
              <div class="d-flex flex-row">
                <span class="mr-3">
                  <v-icon class="mr-1" icon="mdi-format-list-bulleted-type" size="small"></v-icon>
                  Type: {{ type.type }}
                </span>
                <span>
                  <v-icon class="mr-1" icon="mdi-file-tree" size="small"></v-icon>
                  Subtype: {{ type.subType }}
                </span>
              </div>
            </v-list-item-subtitle>
          </v-list-item>

          <!-- Empty state when no types match filters -->
          <v-list-item v-if="filteredTypes.length === 0 && hasActiveFilters">
            <v-list-item-title class="text-center text-grey">
              <v-icon class="mr-2" icon="mdi-file-search"></v-icon>
              No types match the current filters
            </v-list-item-title>
          </v-list-item>

          <!-- Empty state when no types exist -->
          <v-list-item v-if="filteredTypes.length === 0 && !hasActiveFilters && props.typeList?.length === 0">
            <v-list-item-title class="text-center text-grey">
              <v-icon class="mr-2" icon="mdi-format-list-bulleted-type-plus"></v-icon>
              No types available. Click "New" to create the first document type.
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </div>
      <div v-if="props.isAdmin" class="d-flex justify-end mt-3">
        <v-btn color="primary" class="mr-2" prepend-icon="mdi-plus" @click="showCreationDialog = true">New</v-btn>
        <v-btn color="error" prepend-icon="mdi-delete" @click="confirmDelete" :disabled="!selectedTypeID">Remove</v-btn>
      </div>

      <!-- Creation Dialog -->
      <TypeCreationDialog
          v-if="showCreationDialog"
          :show="showCreationDialog"
          :type-list="props.typeList"
          :structure-list="props.structureList"
          @typeCreated="handleTypeCreated"
          @cancel-dialog="cancelCreation"
      />

      <!-- Delete Confirmation Dialog -->
      <v-dialog v-model="showDeleteConfirmDialog" max-width="500px">
        <v-card>
          <v-card-title>Confirm Deletion</v-card-title>
          <v-card-text>Are you sure you want to delete this document type?</v-card-text>
          <v-card-actions>
            <v-spacer></v-spacer>
            <v-btn color="error" @click="handleTypeDeleted">Delete</v-btn>
            <v-btn @click="cancelDelete">Cancel</v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.type-list-wrapper {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.type-list {
  border-radius: 4px;
}

.type-list-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.type-list-item:last-child {
  border-bottom: none;
}
</style>