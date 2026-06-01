<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import type {I_DataStructure, I_DocumentEntry, I_UserEntry} from "docpouch-client";
import type DbPouchClient from 'docpouch-client';

const props = defineProps<{
  documentList: I_DocumentEntry[];
  userlist: I_UserEntry[]; // Added userlist prop to map owner IDs to usernames
  apiClient: DbPouchClient;
  documentStructures?: I_DataStructure[];
}>();

const emit = defineEmits<{
  'documentSelected': [documentID: string];
  'documentListChanged': [];
  'documentRemoved': [documentID: string];
}>();

// Filter states
const titleFilter = ref('');
const typeFilter = ref<number | null>(null);
const subtypeFilter = ref<number | null>(null);
const ownerFilter = ref('');
const filterMode = ref<'raw' | 'structure'>('structure');
const structureFilter = ref('');

const showDeleteConfirmDialog = ref(false);
const documentToDelete = ref<string | null>(null);

// Multi-select functionality
const selectedDocuments = ref<Set<string>>(new Set());
const isSelectMode = ref(false);

// Create a map of user IDs to usernames
const userMap = computed(() => {
  const map = new Map();
  props.userlist.forEach(user => {
    map.set(user._id, user.name);
  });
  return map;
});

// Function to get username from user ID
const getUsernameFromID = (userID: string): string => {
  const username = userMap.value.get(userID);
  return username !== undefined ? username : `Unknown (${userID})`;
};

const confirmDelete = () => {
  if (isSelectMode.value && selectedDocuments.value.size > 0) {
    // Multi-delete confirmation
    showDeleteConfirmDialog.value = true;
  } else if (selectedDocumentID.value) {
    // Single document delete
    documentToDelete.value = selectedDocumentID.value;
    showDeleteConfirmDialog.value = true;
  }
};

const executeDelete = () => {
  if (isSelectMode.value && selectedDocuments.value.size > 0) {
    // Multi-delete
    removeSelectedDocuments();
    showDeleteConfirmDialog.value = false;
  } else if (documentToDelete.value) {
    // Single document delete
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

// Get unique types and subtypes for filter dropdowns
const availableTypes = computed(() => {
  if (!props.documentList) return [];
  const types = [...new Set(props.documentList.map(doc => doc.type))];
  return types.sort((a, b) => a - b);
});

const availableSubtypes = computed(() => {
  if (!props.documentList) return [];
  const subtypes = [...new Set(props.documentList.map(doc => doc.subType))];
  return subtypes.sort((a, b) => a - b);
});

// Get unique owners (usernames, not IDs) for filter dropdown
const availableOwners = computed(() => {
  if (!props.documentList || !props.userlist) return [];

  const ownerUsernames = props.documentList
    .map(doc => getUsernameFromID(doc.owner))
    .filter(Boolean);

  return [...new Set(ownerUsernames)].sort();
});

const hasDefinedDocumentStructures = computed(() => {
  return props.documentStructures && props.documentStructures.length > 0;
});

const availableStructures = computed(() => {
  if (!props.documentStructures || props.documentStructures.length === 0) return [];

  return props.documentStructures.slice().sort((a, b) => a.name.localeCompare(b.name));
});

const getStructureForDocument = (document: I_DocumentEntry): I_DataStructure | undefined => {
  return props.documentStructures?.find(structure =>
      structure.type === document.type && structure.subType === document.subType
  );
};

const getStructureLabelForDocument = (document: I_DocumentEntry): string => {
  const structure = getStructureForDocument(document);
  return structure ? structure.name : `Unknown structure (${document.type}/${document.subType})`;
};

// Enhanced document list with filtering
const documents = computed(() => {
  if (!props.documentList) return [];

  let filteredDocs = props.documentList.sort((a, b) => a.title.localeCompare(b.title));

  // Apply filters
  if (titleFilter.value) {
    filteredDocs = filteredDocs.filter(doc =>
      doc.title.toLowerCase().includes(titleFilter.value.toLowerCase())
    );
  }

  if (filterMode.value === 'raw') {
    // Filter by raw type and subtype numbers
    if (typeFilter.value !== null) {
      filteredDocs = filteredDocs.filter(doc => doc.type === typeFilter.value);
    }

    if (subtypeFilter.value !== null) {
      filteredDocs = filteredDocs.filter(doc => doc.subType === subtypeFilter.value);
    }
  } else if (filterMode.value === 'structure') {
    if (structureFilter.value) {
      const selectedType = props.documentStructures?.find(dt => dt.name === structureFilter.value);
      if (selectedType) {
        filteredDocs = filteredDocs.filter(doc =>
            doc.type === selectedType.type && doc.subType === selectedType.subType
        );
      }
    }
  }

  if (ownerFilter.value) {
    // Filter by username instead of user ID
    filteredDocs = filteredDocs.filter(doc => getUsernameFromID(doc.owner) === ownerFilter.value);
  }

  return filteredDocs.map((entry: I_DocumentEntry) => {
    return {
      id: entry._id,
      title: entry.title,
      type: entry.type,
      subType: entry.subType,
      structureName: getStructureLabelForDocument(entry),
      owner: getUsernameFromID(entry.owner), // Display username instead of ID
      ownerId: entry.owner, // Keep the original owner ID for reference
      shareWithGroup: entry.shareWithGroup || false,
      shareWithDepartment: entry.shareWithDepartment || false
    };
  });
});

const selectedDocumentID = ref<string | null>(null);
const showCreateDocumentDialog = ref(false);
const showSuccessSnackbar = ref(false);

const toggleDocumentSelection = (documentID: string) => {
  if (selectedDocuments.value.has(documentID)) {
    selectedDocuments.value.delete(documentID);
  } else {
    selectedDocuments.value.add(documentID);
  }
};

const selectDocument = (documentID: string | undefined) => {
  if (documentID !== undefined) {
    // If in select mode, toggle selection instead of opening document
    if (isSelectMode.value) {
      toggleDocumentSelection(documentID);
    } else {
      selectedDocumentID.value = documentID;
      emit('documentSelected', documentID);
    }
  }
};

const toggleSelectMode = () => {
  isSelectMode.value = !isSelectMode.value;
  // Clear selections when exiting select mode
  if (!isSelectMode.value) {
    selectedDocuments.value.clear();
  }
};

const removeSelectedDocuments = () => {
  selectedDocuments.value.forEach(documentID => {
    emit('documentRemoved', documentID);
  });
  selectedDocuments.value.clear();
  selectedDocumentID.value = null;
};

const addNewDocument = () => {
  console.log('Add new document');
  showCreateDocumentDialog.value = true;
};

const handleDocumentCreated = () => {
  showSuccessSnackbar.value = true;
  emit('documentListChanged');
};

// Clear all filters
const clearFilters = () => {
  titleFilter.value = '';
  typeFilter.value = null;
  subtypeFilter.value = null;
  structureFilter.value = '';
  ownerFilter.value = '';
};

// Check if any filters are active
const hasActiveFilters = computed(() => {
  const rawTypeActive = filterMode.value === 'raw' && (titleFilter.value || typeFilter.value !== null || subtypeFilter.value !== null || ownerFilter.value);
  const structureActive = filterMode.value === 'structure' && (titleFilter.value || structureFilter.value || ownerFilter.value);
  return rawTypeActive || structureActive;
});

// Switch filter mode and clear type/subtype filters
const switchFilterMode = (newMode: 'raw' | 'structure') => {
  if (filterMode.value !== newMode) {
    filterMode.value = newMode;
    typeFilter.value = null;
    subtypeFilter.value = null;
    structureFilter.value = '';
  }
};
</script>

<template>
  <div class="d-flex flex-column">
    <!-- Filter Section -->
    <v-card class="mb-3" variant="outlined">
      <v-card-title class="text-subtitle-1 pa-3">
        <v-icon icon="mdi-filter" class="mr-2"></v-icon>
        Filters
        <v-spacer></v-spacer>
        <!-- Filter Mode Toggle (only show if document structures are defined) -->
        <v-btn-toggle
            v-if="hasDefinedDocumentStructures"
            v-model="filterMode"
            class="mr-2"
            density="compact"
            @update:model-value="switchFilterMode"
        >
          <v-btn size="small" title="Filter by type number and subtype number" value="raw">
            <v-icon class="mr-1" icon="mdi-numeric"></v-icon>
            Raw Type
          </v-btn>
          <v-btn size="small" title="Filter by document structure" value="structure">
            <v-icon class="mr-1" icon="mdi-table"></v-icon>
            Structure
          </v-btn>
        </v-btn-toggle>
        <v-btn
          v-if="hasActiveFilters"
          size="small"
          variant="text"
          color="primary"
          @click="clearFilters"
          prepend-icon="mdi-filter-remove"
        >
          Clear
        </v-btn>
      </v-card-title>
      <v-card-text class="pa-3 pt-0">
        <v-row no-gutters>
          <!-- Raw Type/Subtype Filters - 4 columns evenly distributed -->
          <template v-if="filterMode === 'raw'">
            <v-col class="pr-md-1" cols="12" md="3">
              <v-text-field
                  v-model="titleFilter"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by title"
                  prepend-inner-icon="mdi-file-document-outline"
                  variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col class="px-md-1 mt-2 mt-md-0" cols="12" md="3">
              <v-select
                  v-model="typeFilter"
                  :items="availableTypes"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by type"
                  prepend-inner-icon="mdi-format-list-bulleted-type"
                  variant="outlined"
              ></v-select>
            </v-col>
            <v-col class="px-md-1 mt-2 mt-md-0" cols="12" md="3">
              <v-select
                  v-model="subtypeFilter"
                  :items="availableSubtypes"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by subtype"
                  prepend-inner-icon="mdi-format-list-text"
                  variant="outlined"
              ></v-select>
            </v-col>
            <v-col class="pl-md-1 mt-2 mt-md-0" cols="12" md="3">
              <v-select
                  v-model="ownerFilter"
                  :items="availableOwners"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by owner"
                  prepend-inner-icon="mdi-account"
                  variant="outlined"
              ></v-select>
            </v-col>
          </template>
          <!-- Structure Filter - 3 columns evenly distributed -->
          <template v-else-if="filterMode === 'structure'">
            <v-col class="pr-md-1" cols="12" md="4">
              <v-text-field
                  v-model="titleFilter"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by title"
                  prepend-inner-icon="mdi-file-document-outline"
                  variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col class="px-md-1 mt-2 mt-md-0" cols="12" md="4">
              <v-select
                  v-model="structureFilter"
                  :items="availableStructures.map(t => t.name)"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by structure"
                  prepend-inner-icon="mdi-table"
                  variant="outlined"
              ></v-select>
            </v-col>
            <v-col class="pl-md-1 mt-2 mt-md-0" cols="12" md="4">
              <v-select
                  v-model="ownerFilter"
                  :items="availableOwners"
                  clearable
                  density="compact"
                  hide-details
                  label="Filter by owner"
                  prepend-inner-icon="mdi-account"
                  variant="outlined"
              ></v-select>
            </v-col>
          </template>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Document List -->
    <div class="document-list-wrapper">
      <v-list class="document-list bg-grey-lighten-4" density="compact">
        <v-list-item
          v-for="document in documents"
          :key="document.id"
          :active="selectedDocumentID !== null && selectedDocumentID === document.id"
          @click="selectDocument(document.id)"
          class="document-list-item"
          :class="{ 'selected-item': selectedDocuments.has(document.id) }"
        >
          <template v-slot:prepend>
            <!-- Checkbox for multi-select mode -->
            <v-checkbox
                v-if="isSelectMode"
                :model-value="selectedDocuments.has(document.id)"
                class="mr-2"
                hide-details
                @click.stop="toggleDocumentSelection(document.id)"
            ></v-checkbox>

            <v-avatar size="32" color="primary">
              <v-icon icon="mdi-file-document"></v-icon>
            </v-avatar>
          </template>

          <v-list-item-title>{{ document.title }}</v-list-item-title>
          <v-list-item-subtitle>
            <div class="d-flex flex-row">
              <span class="mr-3">
                <v-icon class="mr-1" icon="mdi-table" size="small"></v-icon>
                {{ document.structureName }}
              </span>
              <span class="mr-3">
                <v-icon icon="mdi-account" size="small" class="mr-1"></v-icon>
                {{ document.owner }}
              </span>
              <span v-if="document.shareWithGroup" class="mr-2">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props }">
                    <v-icon color="primary" icon="mdi-account-group" size="small" v-bind="props"></v-icon>
                  </template>
                  <span>Shared with group</span>
                </v-tooltip>
              </span>
              <span v-if="document.shareWithDepartment">
                <v-tooltip location="top">
                  <template v-slot:activator="{ props }">
                    <v-icon color="primary" icon="mdi-office-building" size="small" v-bind="props"></v-icon>
                  </template>
                  <span>Shared with department</span>
                </v-tooltip>
              </span>
            </div>
          </v-list-item-subtitle>
        </v-list-item>

        <!-- Empty state when no documents match filters -->
        <v-list-item v-if="documents.length === 0 && hasActiveFilters">
          <v-list-item-title class="text-center text-grey">
            <v-icon icon="mdi-file-search" class="mr-2"></v-icon>
            No documents match the current filters
          </v-list-item-title>
        </v-list-item>

        <!-- Empty state when no documents exist -->
        <v-list-item v-if="documents.length === 0 && !hasActiveFilters && props.documentList?.length === 0">
          <v-list-item-title class="text-center text-grey">
            <v-icon icon="mdi-file-plus" class="mr-2"></v-icon>
            No documents available. Click "New" to create the first document.
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </div>

    <div class="d-flex justify-end mt-3">
      <!-- Multi-select controls -->
      <v-btn
          v-if="isSelectMode"
          class="mr-2"
          color="primary"
          variant="text"
          @click="toggleSelectMode"
      >
        Cancel
      </v-btn>

      <v-btn
          v-if="isSelectMode && selectedDocuments.size > 0"
          class="mr-2"
          color="error"
          prepend-icon="mdi-delete"
          @click="showDeleteConfirmDialog = true"
      >
        Remove {{ selectedDocuments.size }} Document(s)
      </v-btn>

      <v-btn
          v-if="isSelectMode"
          color="primary"
          prepend-icon="mdi-select-multiple"
          @click="toggleSelectMode"
      >
        Select Mode
      </v-btn>

      <!-- Standard controls -->
      <v-btn
          v-if="!isSelectMode"
          class="mr-2"
          color="primary"
          prepend-icon="mdi-select-multiple"
          @click="toggleSelectMode"
      >
        Select Multiple
      </v-btn>

      <v-btn
          v-if="!isSelectMode"
          :disabled="!selectedDocumentID"
          color="error"
          prepend-icon="mdi-delete"
          @click="confirmDelete"
      >
        Remove
      </v-btn>
    </div>
  </div>

  <!-- Document creation dialog would be placed here -->

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

  <!-- Confirmation dialog -->
  <v-dialog v-model="showDeleteConfirmDialog" max-width="400">
    <v-card>
      <v-card-title class="text-h5">Confirm Deletion</v-card-title>
      <v-card-text>
        <div v-if="isSelectMode && selectedDocuments.size > 0">
          Are you sure you want to delete {{ selectedDocuments.size }} selected document(s)?
          This action permanently removes all content and cannot be undone. Associated data will be lost.
        </div>
        <div v-else>
          Deleting a document permanently removes all its content and cannot be undone. Associated data will be lost.
        </div>
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
.document-list-wrapper {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.document-list {
  border-radius: 4px;
}

.document-list-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.document-list-item:last-child {
  border-bottom: none;
}

.selected-item {
  background-color: rgba(33, 150, 243, 0.1) !important;
}
</style>
