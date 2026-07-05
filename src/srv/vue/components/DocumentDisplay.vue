<script setup lang="ts">
import {ref, watch, computed, onBeforeUnmount, reactive} from "vue";
import type {I_DataStructure, I_DocumentEntry} from "docpouch-client";

const props = defineProps<{
  object: I_DocumentEntry | undefined;
  id: string;
  structureList: I_DataStructure[];
  apiClient?: any;
}>();

// eslint-disable-next-line no-console
console.warn('[docLink] DocumentDisplay setup: apiClient present=', !!props.apiClient, 'type=', typeof props.apiClient?.fetchDocuments);

const emit = defineEmits<{
  'update:object': [updatedObject: I_DocumentEntry | undefined];
  'document-link-clicked': [documentId: string];
  'structure-link-clicked': [structureId: string];
  'document-link-missing': [documentId: string];
}>();

// Track expanded state for each property
const expandedProperties = ref(new Set<string>());

// Add missing functions for expanding/collapsing properties
const toggleExpanded = (key: string) => {
  if (expandedProperties.value.has(key)) {
    expandedProperties.value.delete(key);
  } else {
    expandedProperties.value.add(key);
  }
};

const isExpanded = (key: string) => {
  return expandedProperties.value.has(key);
};

// Add missing rawContent ref
const rawContent = ref('');


// For editing values
const editingPath = ref<string[]>([]);
const editingValue = ref<any>(null);

// Copy-to-clipboard state for the _id chip in the header
const idCopied = ref(false);
let idCopiedResetTimer: ReturnType<typeof setTimeout> | null = null;

async function copyIdToClipboard() {
  const id = props.object?._id;
  if (!id) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(id);
      } else {
        // Fallback for environments without the async Clipboard API.
        const ta = document.createElement("textarea");
        ta.value = id;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      idCopied.value = true;
      if (idCopiedResetTimer) clearTimeout(idCopiedResetTimer);
      idCopiedResetTimer = setTimeout(() => {
        idCopied.value = false;
      }, 1500);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Could not copy document id to clipboard:", err);
    }
}

type DocLinkState = 'unknown' | 'found' | 'missing';
type DocLinkKind = 'document' | 'structure';

interface DocLinkEntry {
  state: DocLinkState;
  kind?: DocLinkKind;
  title?: string;
}

const DOCPOUCH_ID_REGEX = /^[A-Za-z0-9]{16}$/;

const docLinkCache = reactive<Record<string, DocLinkEntry>>({});
const pendingLookups: Record<string, ReturnType<typeof setTimeout>> = {};
const cacheVersion = ref(0);

function couldBeDocumentId(value: any): boolean {
  return typeof value === 'string'
      && DOCPOUCH_ID_REGEX.test(value)
      && value !== props.object?._id;
}

function getDocLinkEntry(docId: string): DocLinkEntry {
  // touch cacheVersion so the template re-renders when the cache changes
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  cacheVersion.value;
  return docLinkCache[docId] ?? {state: 'unknown'};
}

function setDocLinkEntry(docId: string, entry: DocLinkEntry) {
  docLinkCache[docId] = entry;
  cacheVersion.value += 1;
}

function resolveDocLink(docId: string): Promise<DocLinkEntry> {
  // eslint-disable-next-line no-console
  console.warn('[docLink] resolveDocLink start', docId, 'apiClient=', !!props.apiClient, 'apiClientType=', typeof props.apiClient, 'hasFetch=', typeof props.apiClient?.fetchDocuments);

  const matchingStructure = props.structureList.find(s => s._id === docId);
  if (matchingStructure) {
    const entry: DocLinkEntry = {state: 'found', kind: 'structure', title: matchingStructure.name};
    setDocLinkEntry(docId, entry);
    return Promise.resolve(entry);
  }

  if (!props.apiClient) {
    // eslint-disable-next-line no-console
    console.warn('[docLink] apiClient missing, returning unknown');
    return Promise.resolve({state: 'unknown'});
  }
  return props.apiClient
      .fetchDocuments({_id: docId} as any)
      .then((docs: I_DocumentEntry[]) => {
        // eslint-disable-next-line no-console
        console.warn('[docLink] fetchDocuments returned', docId, 'docs.length=', docs?.length);
        const entry: DocLinkEntry = docs.length > 0
            ? {state: 'found', kind: 'document', title: docs[0].title}
            : {state: 'missing'};
        setDocLinkEntry(docId, entry);
        return entry;
      })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[docLink] fetchDocuments threw', docId, err);
        const entry: DocLinkEntry = {state: 'missing'};
        setDocLinkEntry(docId, entry);
        return entry;
      });
}

function scheduleLookup(docId: string) {
  // eslint-disable-next-line no-console
  console.warn('[docLink] scheduleLookup', docId, 'cached=', docLinkCache[docId]?.state);
  if (docLinkCache[docId]) return;
  if (pendingLookups[docId]) return;
  pendingLookups[docId] = setTimeout(() => {
    delete pendingLookups[docId];
    resolveDocLink(docId)
        .then(entry => {
          // eslint-disable-next-line no-console
          console.warn('[docLink] resolveDocLink resolved', docId, entry);
        })
        .catch(err => {
          // eslint-disable-next-line no-console
          console.warn('[docLink] resolveDocLink rejected', docId, err);
        });
  }, 150);
}

async function openDocument(docId: string) {
  // eslint-disable-next-line no-console
  console.warn('[docLink] openDocument called', docId, 'cached=', docLinkCache[docId]?.state);
  const cached = docLinkCache[docId];
  if (!cached) {
    const entry = await resolveDocLink(docId);
    if (entry.state === 'found') {
      if (entry.kind === 'structure') {
        emit('structure-link-clicked', docId);
      } else {
        emit('document-link-clicked', docId);
      }
    } else if (entry.state === 'missing') {
      emit('document-link-missing', docId);
    }
    return;
  }
  if (cached.state === 'found') {
    if (cached.kind === 'structure') {
      emit('structure-link-clicked', docId);
    } else {
      emit('document-link-clicked', docId);
    }
  } else if (cached.state === 'missing') {
    emit('document-link-missing', docId);
  }
}

onBeforeUnmount(() => {
  for (const id of Object.keys(pendingLookups)) {
    clearTimeout(pendingLookups[id]);
    delete pendingLookups[id];
  }
  if (idCopiedResetTimer) {
    clearTimeout(idCopiedResetTimer);
    idCopiedResetTimer = null;
  }
});

// Check if we're currently editing a path
const isEditing = (path: string[]) => {
  if (editingPath.value.length !== path.length) return false;

  return path.every((segment, index) => segment === editingPath.value[index]);
};

const updateShareSetting = (setting: string, value: boolean | null) => {
  if (!props.object) return;

  const updatedObject = JSON.parse(JSON.stringify(props.object));
  updatedObject[setting] = value;
  emit('update:object', updatedObject);
};

const selectedStructureID = computed(() => {
  if (!props.object) {
    return null;
  }

  return props.structureList.find(structure =>
      structure.type === props.object?.type && structure.subType === props.object?.subType
  )?._id ?? null;
});

const structureOptions = computed(() => {
  return props.structureList
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(structure => ({
        title: `${structure.name} (${structure.type}/${structure.subType})`,
        value: structure._id
      }));
});

const updateDocumentStructure = (structureID: string | null) => {
  if (!props.object || !structureID) {
    return;
  }

  const selectedStructure = props.structureList.find(structure => structure._id === structureID);
  if (!selectedStructure) {
    return;
  }

  const updatedObject = JSON.parse(JSON.stringify(props.object));
  updatedObject.type = selectedStructure.type;
  updatedObject.subType = selectedStructure.subType;
  emit('update:object', updatedObject);
};

// Start editing a value
const startEditing = (path: string[], value: any) => {
  // Only allow editing primitive values
  if (value !== null && typeof value === 'object') return;

  editingPath.value = [...path];
  editingValue.value = value;
};

// Save the edited value
const saveEdit = () => {
  if (!props.object || editingPath.value.length === 0) return;

  // Create a deep copy of the object
  const updatedObject = JSON.parse(JSON.stringify(props.object));

  // Check if we're editing metadata fields directly (title, description, type, subType)
  const isMetadataField = ['title', 'description', 'type', 'subType'].includes(editingPath.value[0]);

  if (isMetadataField) {
    const field = editingPath.value[0];
    let typedValue = editingValue.value;

    // Special validation for type and subType (must be integers)
    if (field === 'type' || field === 'subType') {
      // Convert to number
      typedValue = parseInt(editingValue.value, 10);

      // Validate it's an integer
      if (isNaN(typedValue) || !Number.isInteger(typedValue)) {
        alert(`${field} must be an integer value`);
        return;
      }
    }

    // Update the metadata field directly
    updatedObject[field] = typedValue;
  } else {
    // This is for content fields (original logic)
    // Navigate to the parent object
    let current = updatedObject;
    let lastKey: number | string = editingPath.value[editingPath.value.length - 1];

    // Navigate to the correct position
    for (let i = 0; i < editingPath.value.length - 1; i++) {
      const key = editingPath.value[i];
      if (key === 'content') {
        current = current.content;
      } else {
        // Handle array indices (convert to number if needed)
        const parsedKey = !isNaN(Number(key)) ? Number(key) : key;
        current = current[parsedKey];
      }
    }

    // Convert lastKey to number if it's an array index
    lastKey = !isNaN(Number(lastKey)) ? Number(lastKey) : lastKey;

    // Get the original value to determine type
    let originalValue: any = props.object;
    for (let i = 0; i < editingPath.value.length; i++) {
      const key = editingPath.value[i];
      if (originalValue === undefined) break;

      if (key === 'content') {
        originalValue = originalValue.content;
      } else {
        const parsedKey = !isNaN(Number(key)) ? Number(key) : key;
        originalValue = originalValue[parsedKey];
      }
    }

    // Convert the value to match the original type
    let typedValue = editingValue.value;

    if (typeof originalValue === 'number') {
      typedValue = Number(editingValue.value);
    } else if (typeof originalValue === 'boolean') {
      if (typeof editingValue.value === 'string') {
        typedValue = editingValue.value.toLowerCase() === 'true';
      } else {
        typedValue = Boolean(editingValue.value);
      }
    }

    // Update the value
    current[lastKey] = typedValue;
  }

  // Emit the updated object
  emit('update:object', updatedObject);

  // Exit edit mode
  cancelEdit();
};

// Cancel editing
const cancelEdit = () => {
  editingPath.value = [];
  editingValue.value = null;
};

// Handle keydown events while editing
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveEdit();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    cancelEdit();
  }
};

// Update raw content and expanded properties when object changes
watch(() => props.object?.content, (newContent) => {
  if (newContent) {
    rawContent.value = JSON.stringify(newContent, null, 2);

    // Automatically expand all properties initially
    expandedProperties.value = new Set(
      Object.keys(newContent).filter(key => 
        typeof newContent[key] === 'object' && newContent[key] !== null
      )
    );
  } else {
    rawContent.value = '';
  }
}, { immediate: true, deep: true });

// Function to get the full path string for debug display
const getPathString = (path: string[]) => {
  return path.join('.');
};

// Helper function to render a value with edit controls
const renderValueWithEdit = (value: any, path: string[]) => {
  const fullPath = [...path];
  const isPrimitive = value === null || typeof value !== 'object';

  if (!isPrimitive) {
    return {
      isEditable: false,
      display: Array.isArray(value) ? `Array (${value.length})` : 'Object'
    };
  }

  return {
    isEditable: true,
    display: value === null ? 'null' : value.toString()
  };
};

// Recursive function to get a nested value from an object using a path
const getValueAtPath = (obj: any, path: string[]): any => {
  let current = obj;

  for (const key of path) {
    if (!current) return undefined;

    if (!isNaN(Number(key))) {
      // It's an array index
      current = current[Number(key)];
    } else {
      current = current[key];
    }
  }

  return current;
};
</script>

<template>
  <v-card class="doc-viewer">
    <v-card-title class="text-h6 d-flex align-center flex-wrap">
      <span>{{ props.object?.title }}</span>
      <v-tooltip v-if="props.object?._id" location="top">
        <template v-slot:activator="{ props: tipProps }">
          <v-chip
              class="ml-3"
              density="compact"
              prepend-icon="mdi-identifier"
              size="small"
              v-bind="tipProps"
              variant="tonal"
              @click="copyIdToClipboard"
          >
            <span class="text-caption">_id: {{ props.object._id }}</span>
            <v-icon
                :icon="idCopied ? 'mdi-check' : 'mdi-content-copy'"
                class="ml-1"
                size="x-small"
            ></v-icon>
          </v-chip>
        </template>
        Click to copy the document id to the clipboard
      </v-tooltip>
    </v-card-title>

    <v-card-text>
      <v-sheet
        class="mb-4 pa-3 rounded bg-grey-lighten-4"
        v-if="props.object"
      >
        <div class="d-flex justify-space-between align-center mb-2">
          <span class="text-body-2">Document Metadata</span>
          <v-tooltip location="top">
            <template v-slot:activator="{ props }">
              <v-icon v-bind="props" icon="mdi-help-circle-outline" size="small"></v-icon>
            </template>
            Click the pencil icon to edit fields. Press Enter to save or Esc to cancel changes.
          </v-tooltip>
        </div>

        <div class="d-flex flex-column">
          <div class="d-flex align-center mb-2">
            <span class="font-weight-medium mr-2">Title:</span>

            <!-- Title editing -->
            <template v-if="isEditing(['title'])">
              <div class="d-flex align-center flex-grow-1">
                <v-text-field
                  v-model="editingValue"
                  density="compact"
                  hide-details
                  variant="outlined"
                  class="edit-field flex-grow-1"
                  @keydown="handleKeyDown"
                  autofocus
                ></v-text-field>
                <v-btn 
                  icon="mdi-check" 
                  size="small" 
                  color="success" 
                  class="ml-2"
                  @click="saveEdit()"
                ></v-btn>
                <v-btn 
                  icon="mdi-close" 
                  size="small" 
                  color="error" 
                  class="ml-2"
                  @click="cancelEdit()"
                ></v-btn>
              </div>
            </template>
            <div v-else class="d-flex align-center flex-grow-1">
              <span>{{ props.object.title }}</span>
              <v-btn
                icon="mdi-pencil"
                size="x-small"
                variant="text"
                color="primary"
                class="ml-2"
                @click.stop="startEditing(['title'], props.object.title)"
              ></v-btn>
            </div>
          </div>

          <div class="d-flex align-center mb-2">
            <span class="font-weight-medium mr-2">Description:</span>

            <!-- Description editing -->
            <template v-if="isEditing(['description'])">
              <div class="d-flex align-center flex-grow-1">
                <v-text-field
                  v-model="editingValue"
                  density="compact"
                  hide-details
                  variant="outlined"
                  class="edit-field flex-grow-1"
                  @keydown="handleKeyDown"
                  autofocus
                ></v-text-field>
                <v-btn 
                  icon="mdi-check" 
                  size="small" 
                  color="success" 
                  class="ml-2"
                  @click="saveEdit()"
                ></v-btn>
                <v-btn 
                  icon="mdi-close" 
                  size="small" 
                  color="error" 
                  class="ml-2"
                  @click="cancelEdit()"
                ></v-btn>
              </div>
            </template>
            <div v-else class="d-flex align-center flex-grow-1">
              <span>{{ props.object.description }}</span>
              <v-btn
                icon="mdi-pencil"
                size="x-small"
                variant="text"
                color="primary"
                class="ml-2"
                @click.stop="startEditing(['description'], props.object.description)"
              ></v-btn>
            </div>
          </div>

          <div class="d-flex align-center">
            <div class="mr-4 d-flex align-center flex-grow-1">
              <span class="font-weight-medium mr-2">Structure:</span>
              <v-select
                  :items="structureOptions"
                  :model-value="selectedStructureID"
                  class="structure-select"
                  density="compact"
                  hide-details
                  placeholder="Unknown structure"
                  variant="outlined"
                  @update:model-value="updateDocumentStructure"
              ></v-select>
            </div>

            <v-chip class="mr-4" color="primary" size="small" variant="tonal">
              {{ props.object.type }}/{{ props.object.subType }}
            </v-chip>

            <span v-if="editingPath.length > 0" class="ml-auto text-caption">
              Editing: {{ getPathString(editingPath) }}
            </span>
          </div>

          <!-- Document Sharing Options -->
          <div class="d-flex align-center mt-3">
            <span class="font-weight-medium mr-2">Sharing:</span>

            <!-- Share with Group toggle -->
            <div class="mr-4 d-flex align-center">
              <v-tooltip location="top">
                <template v-slot:activator="{ props: tooltipProps }">
                  <div class="d-flex align-center" v-bind="tooltipProps">
                    <span class="mr-2">Share with Group:</span>
                    <v-switch
                        :model-value="props.object.shareWithGroup"
                        class="mt-0 pt-0"
                        color="primary"
                        density="compact"
                        hide-details
                        @update:model-value="(val) => updateShareSetting('shareWithGroup', val)"
                    ></v-switch>

                  </div>
                </template>
                <span>Share this document with all users in your group</span>
              </v-tooltip>
            </div>


            <!-- Share with Department toggle -->
            <div class="mr-4 d-flex align-center">
              <v-tooltip location="top">
                <template v-slot:activator="{ props: tooltipProps }">
                  <div class="d-flex align-center" v-bind="tooltipProps">
                    <span class="mr-2">Share with Department:</span>
                    <v-switch
                        :model-value="props.object.shareWithDepartment"
                        class="mt-0 pt-0"
                        color="primary"
                        density="compact"
                        hide-details
                        @update:model-value="(val) => updateShareSetting('shareWithDepartment', val)"
                    ></v-switch>
                  </div>
                </template>
                <span>Share this document with all users in your department</span>
              </v-tooltip>
            </div>

            <!-- Public toggle -->
            <div class="d-flex align-center">
              <v-tooltip location="top">
                <template v-slot:activator="{ props: tooltipProps }">
                  <div class="d-flex align-center" v-bind="tooltipProps">
                    <span class="mr-2">Public:</span>
                    <v-switch
                        :model-value="props.object.public"
                        class="mt-0 pt-0"
                        color="primary"
                        density="compact"
                        hide-details
                        @update:model-value="(val) => updateShareSetting('public', val)"
                    ></v-switch>
                  </div>
                </template>
                <span>Make this document readable by all authenticated users</span>
              </v-tooltip>
            </div>
          </div>
        </div>
      </v-sheet>

      <!-- The rest of your content display code remains the same -->
      <v-list v-if="props.object?.content" class="content-list">
        <v-list-subheader>Document Content</v-list-subheader>

        <template v-for="(value, key) in props.object.content" :key="key">
          <v-list-item class="content-item">
            <template v-slot:prepend>
              <v-icon
                v-if="typeof value === 'object' && value !== null"
                :icon="isExpanded(String(key)) ? 'mdi-chevron-down' : 'mdi-chevron-right'"
                @click.stop="toggleExpanded(String(key))"
                class="mr-2 cursor-pointer"
              ></v-icon>
              <v-icon
                :icon="typeof value === 'object' ? (Array.isArray(value) ? 'mdi-format-list-bulleted' : 'mdi-folder') : 'mdi-file-document'"
                :color="typeof value === 'object' ? (Array.isArray(value) ? 'orange' : 'amber') : 'blue'"
              ></v-icon>
            </template>

            <v-list-item-title 
              @click="typeof value === 'object' && value !== null ? toggleExpanded(String(key)) : null"
              class="mr-4"
            >
              {{ key }}:
            </v-list-item-title>

            <!-- Editable value display -->
            <v-list-item-subtitle class="flex-grow-1">
              <!-- If currently editing this value -->
              <template v-if="isEditing(['content', String(key)])">
                <div class="d-flex align-center">
                  <v-text-field
                    v-model="editingValue"
                    density="compact"
                    hide-details
                    variant="outlined"
                    class="edit-field flex-grow-1"
                    @keydown="handleKeyDown"
                    autofocus
                  ></v-text-field>
                  <v-btn 
                    icon="mdi-check" 
                    size="small" 
                    color="success" 
                    class="ml-2"
                    @click="saveEdit()"
                  ></v-btn>
                  <v-btn 
                    icon="mdi-close" 
                    size="small" 
                    color="error" 
                    class="ml-2"
                    @click="cancelEdit()"
                  ></v-btn>
                </div>
              </template>

              <!-- Normal display with edit button for primitive values -->
              <template v-else>
                <div class="d-flex align-center">
                  <template v-if="couldBeDocumentId(value)">
                    <a
                        v-if="getDocLinkEntry(value).state === 'found'"
                        :class="getDocLinkEntry(value).kind === 'structure' ? 'doc-link doc-link--structure' : 'doc-link doc-link--ok'"
                        :title="getDocLinkEntry(value).kind === 'structure' ? 'Structure: ' + getDocLinkEntry(value).title : getDocLinkEntry(value).title"
                        @mouseenter="scheduleLookup(value)"
                        @mousedown.stop.prevent="openDocument(value)"
                    >
                      <v-icon :color="getDocLinkEntry(value).kind === 'structure' ? 'deep-purple' : 'success'"
                              :icon="getDocLinkEntry(value).kind === 'structure' ? 'mdi-form-dropdown' : 'mdi-link-variant'"
                              class="mr-1"
                              size="small"></v-icon>
                      {{
                        getDocLinkEntry(value).kind === 'structure' ? getDocLinkEntry(value).title + ' (structure)' : getDocLinkEntry(value).title || value
                      }}
                    </a>
                    <span
                        v-else-if="getDocLinkEntry(value).state === 'missing'"
                        class="doc-link doc-link--missing"
                        title="Referenced document not found"
                    >
                      <v-icon class="mr-1" color="error" icon="mdi-link-off" size="small"></v-icon>
                      {{ value }}
                    </span>
                    <a
                        v-else
                        class="doc-link"
                        :title="value"
                        @mouseenter="scheduleLookup(value)"
                        @mousedown.stop.prevent="openDocument(value)"
                    >
                      <v-icon class="mr-1" icon="mdi-link-variant" size="small"></v-icon>
                      {{ value.length > 20 ? value.slice(0, 20) + '...' : value }}
                    </a>
                  </template>
                  <template v-else>
                    <span
                        :class="`type-${typeof value}`"
                    >
                      {{ value === null ? 'null' : value }}
                    </span>
                  </template>

                  <!-- Edit button for primitive values -->
                  <v-btn
                      v-if="!couldBeDocumentId(value) && (typeof value !== 'object' || value === null)"
                    icon="mdi-pencil"
                    size="x-small"
                    variant="text"
                    color="primary"
                    class="ml-2"
                    @click.stop="startEditing(['content', String(key)], value)"
                  ></v-btn>
                </div>
              </template>
            </v-list-item-subtitle>
          </v-list-item>

          <!-- Nested content for objects -->
          <div v-if="typeof value === 'object' && value !== null && isExpanded(String(key))" class="nested-list ml-8 pl-4">
            <template v-if="Array.isArray(value)">
              <v-list-item v-for="(item, index) in value" :key="index" density="compact" class="content-item">
                <template v-slot:prepend>
                  <v-icon
                    :icon="typeof item === 'object' && item !== null ? 'mdi-folder' : 'mdi-file-document'"
                    :color="typeof item === 'object' ? 'amber' : 'blue'"
                    size="small"
                  ></v-icon>
                </template>

                <v-list-item-title class="mr-4">[{{ index }}]:</v-list-item-title>

                <!-- Editable array item -->
                <v-list-item-subtitle class="flex-grow-1">
                  <!-- If currently editing this value -->
                  <template v-if="isEditing(['content', String(key), index.toString()])">
                    <div class="d-flex align-center">
                      <v-text-field
                        v-model="editingValue"
                        density="compact"
                        hide-details
                        variant="outlined"
                        class="edit-field flex-grow-1"
                        @keydown="handleKeyDown"
                        autofocus
                      ></v-text-field>
                      <v-btn 
                        icon="mdi-check" 
                        size="small" 
                        color="success" 
                        class="ml-2"
                        @click="saveEdit()"
                      ></v-btn>
                      <v-btn 
                        icon="mdi-close" 
                        size="small" 
                        color="error" 
                        class="ml-2"
                        @click="cancelEdit()"
                      ></v-btn>
                    </div>
                  </template>

                  <!-- Normal display with edit button for primitive values -->
                  <template v-else>
                    <div class="d-flex align-center">
                      <template v-if="couldBeDocumentId(item)">
                        <a
                            v-if="getDocLinkEntry(item).state === 'found'"
                            :class="getDocLinkEntry(item).kind === 'structure' ? 'doc-link doc-link--structure' : 'doc-link doc-link--ok'"
                            :title="getDocLinkEntry(item).kind === 'structure' ? 'Structure: ' + getDocLinkEntry(item).title : getDocLinkEntry(item).title"
                            @mouseenter="scheduleLookup(item)"
                            @mousedown.stop.prevent="openDocument(item)"
                        >
                          <v-icon :color="getDocLinkEntry(item).kind === 'structure' ? 'deep-purple' : 'success'"
                                  :icon="getDocLinkEntry(item).kind === 'structure' ? 'mdi-form-dropdown' : 'mdi-link-variant'"
                                  class="mr-1"
                                  size="small"></v-icon>
                          {{
                            getDocLinkEntry(item).kind === 'structure' ? getDocLinkEntry(item).title + ' (structure)' : getDocLinkEntry(item).title || item
                          }}
                        </a>
                        <span
                            v-else-if="getDocLinkEntry(item).state === 'missing'"
                            class="doc-link doc-link--missing"
                            title="Referenced document not found"
                        >
                          <v-icon class="mr-1" color="error" icon="mdi-link-off" size="small"></v-icon>
                          {{ item }}
                        </span>
                        <a
                            v-else
                            class="doc-link"
                            :title="item"
                            @mouseenter="scheduleLookup(item)"
                            @mousedown.stop.prevent="openDocument(item)"
                        >
                          <v-icon class="mr-1" icon="mdi-link-variant" size="small"></v-icon>
                          {{ item.length > 20 ? item.slice(0, 20) + '...' : item }}
                        </a>
                      </template>
                      <template v-else>
                        <span
                            v-if="typeof item !== 'object' || item === null"
                            :class="`type-${typeof item}`"
                        >
                          {{ item === null ? 'null' : item }}
                        </span>
                        <span v-else>
                          {{ Array.isArray(item) ? `Array (${item.length})` : 'Object' }}
                        </span>
                      </template>

                      <!-- Edit button for primitive values -->
                      <v-btn
                          v-if="!couldBeDocumentId(item) && (typeof item !== 'object' || item === null)"
                        icon="mdi-pencil"
                        size="x-small"
                        variant="text"
                        color="primary"
                        class="ml-2"
                        @click.stop="startEditing(['content', String(key), index.toString()], item)"
                      ></v-btn>
                    </div>
                  </template>
                </v-list-item-subtitle>
              </v-list-item>
            </template>
            <template v-else>
              <v-list-item v-for="(nestedValue, nestedKey) in value" :key="nestedKey" density="compact" class="content-item">
                <template v-slot:prepend>
                  <v-icon
                    :icon="typeof nestedValue === 'object' && nestedValue !== null ? (Array.isArray(nestedValue) ? 'mdi-format-list-bulleted' : 'mdi-folder') : 'mdi-file-document'"
                    :color="typeof nestedValue === 'object' ? (Array.isArray(nestedValue) ? 'orange' : 'amber') : 'blue'"
                    size="small"
                  ></v-icon>
                </template>

                <v-list-item-title class="mr-4">{{ nestedKey }}:</v-list-item-title>

                <!-- Editable nested value -->
                <v-list-item-subtitle class="flex-grow-1">
                  <!-- If currently editing this value -->
                  <template v-if="isEditing(['content', String(key), String(nestedKey)])">
                    <div class="d-flex align-center">
                      <v-text-field
                        v-model="editingValue"
                        density="compact"
                        hide-details
                        variant="outlined"
                        class="edit-field flex-grow-1"
                        @keydown="handleKeyDown"
                        autofocus
                      ></v-text-field>
                      <v-btn 
                        icon="mdi-check" 
                        size="small" 
                        color="success" 
                        class="ml-2"
                        @click="saveEdit()"
                      ></v-btn>
                      <v-btn 
                        icon="mdi-close" 
                        size="small" 
                        color="error" 
                        class="ml-2"
                        @click="cancelEdit()"
                      ></v-btn>
                    </div>
                  </template>

                  <!-- Normal display with edit button for primitive values -->
                  <template v-else>
                    <div class="d-flex align-center">
                      <template v-if="couldBeDocumentId(nestedValue)">
                        <a
                            v-if="getDocLinkEntry(nestedValue).state === 'found'"
                            :class="getDocLinkEntry(nestedValue).kind === 'structure' ? 'doc-link doc-link--structure' : 'doc-link doc-link--ok'"
                            :title="getDocLinkEntry(nestedValue).kind === 'structure' ? 'Structure: ' + getDocLinkEntry(nestedValue).title : getDocLinkEntry(nestedValue).title"
                            @mouseenter="scheduleLookup(nestedValue)"
                            @mousedown.stop.prevent="openDocument(nestedValue)"
                        >
                          <v-icon :color="getDocLinkEntry(nestedValue).kind === 'structure' ? 'deep-purple' : 'success'"
                                  :icon="getDocLinkEntry(nestedValue).kind === 'structure' ? 'mdi-form-dropdown' : 'mdi-link-variant'"
                                  class="mr-1"
                                  size="small"></v-icon>
                          {{
                            getDocLinkEntry(nestedValue).kind === 'structure' ? getDocLinkEntry(nestedValue).title + ' (structure)' : getDocLinkEntry(nestedValue).title || nestedValue
                          }}
                        </a>
                        <span
                            v-else-if="getDocLinkEntry(nestedValue).state === 'missing'"
                            class="doc-link doc-link--missing"
                            title="Referenced document not found"
                        >
                          <v-icon class="mr-1" color="error" icon="mdi-link-off" size="small"></v-icon>
                          {{ nestedValue }}
                        </span>
                        <a
                            v-else
                            class="doc-link"
                            :title="nestedValue"
                            @mouseenter="scheduleLookup(nestedValue)"
                            @mousedown.stop.prevent="openDocument(nestedValue)"
                        >
                          <v-icon class="mr-1" icon="mdi-link-variant" size="small"></v-icon>
                          {{ nestedValue.length > 20 ? nestedValue.slice(0, 20) + '...' : nestedValue }}
                        </a>
                      </template>
                      <template v-else>
                        <span
                            v-if="typeof nestedValue !== 'object' || nestedValue === null"
                            :class="`type-${typeof nestedValue}`"
                        >
                          {{ nestedValue === null ? 'null' : nestedValue }}
                        </span>
                        <span v-else>
                          {{ Array.isArray(nestedValue) ? `Array (${nestedValue.length})` : 'Object' }}
                        </span>
                      </template>

                      <!-- Edit button for primitive values -->
                      <v-btn
                          v-if="!couldBeDocumentId(nestedValue) && (typeof nestedValue !== 'object' || nestedValue === null)"
                        icon="mdi-pencil"
                        size="x-small"
                        variant="text"
                        color="primary"
                        class="ml-2"
                        @click.stop="startEditing(['content', String(key), String(nestedKey)], nestedValue)"
                      ></v-btn>
                    </div>
                  </template>
                </v-list-item-subtitle>
              </v-list-item>
            </template>
          </div>

          <v-divider></v-divider>
        </template>
      </v-list>

      <!-- Fallback JSON display -->
      <v-expansion-panels v-if="rawContent">
        <v-expansion-panel>
          <v-expansion-panel-title>
            Raw JSON Content
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <pre class="raw-json">{{ rawContent }}</pre>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <div v-if="!props.object?.content" class="text-center pa-4">
        No content data to display
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.doc-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.content-list {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 16px;
}

.nested-list {
  border-left: 2px solid #e0e0e0;
  margin-bottom: 8px;
}

.content-item {
  transition: background-color 0.2s ease;
}

.content-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.cursor-pointer {
  cursor: pointer;
}

.edit-field {
  font-size: 14px;
}

.structure-select {
  max-width: 360px;
}

.raw-json {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
}

.doc-link {
  color: #1976d2;
  text-decoration: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.doc-link:hover {
  text-decoration: underline;
}

.doc-link .v-icon {
  color: #9e9e9e;
}

.doc-link--ok {
  color: #1976d2;
}

.doc-link--ok .v-icon {
  color: #2e7d32;
}

.doc-link--structure {
  color: #5e35b1;
}

.doc-link--structure .v-icon {
  color: #5e35b1;
}

.doc-link--missing {
  color: #d32f2f;
  cursor: not-allowed;
}

.doc-link--missing .v-icon {
  color: #d32f2f;
}

.doc-link--missing:hover {
  text-decoration: none;
}
</style>
