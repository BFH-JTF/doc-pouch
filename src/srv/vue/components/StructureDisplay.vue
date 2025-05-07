<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { I_DataStructure } from "../types.js";

const props = defineProps<{
  structure: I_DataStructure | undefined;
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'update:structure': [updatedStructure: I_DataStructure | undefined];
}>();

// Track expanded state for each property
const expandedProperties = ref(new Set<string>());

// Add functions for expanding/collapsing properties
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

// Format structure metadata
const structureMetadata = computed(() => {
  if (!props.structure) return null;

  return {
    title: props.structure.name || 'Untitled Structure',
    fieldCount: props.structure.fields?.length || 0
  };
});

// For editing values
const editingPath = ref<string[]>([]);
const editingValue = ref<any>(null);

// Check if we're currently editing a path
const isEditing = (path: string[]) => {
  if (editingPath.value.length !== path.length) return false;

  return path.every((segment, index) => segment === editingPath.value[index]);
};

// Start editing a value
const startEditing = (path: string[], value: any) => {
  // Only allow editing primitive values and only for admin users
  if (value !== null && typeof value === 'object') return;
  if (!props.isAdmin) return;

  editingPath.value = [...path];
  editingValue.value = value;
};

// Save the edited value
const saveEdit = () => {
  if (!props.structure || editingPath.value.length === 0) return;
  if (!props.isAdmin) return; // Only admins can save changes

  // Create a deep copy of the structure
  const updatedStructure = JSON.parse(JSON.stringify(props.structure));

  // Navigate to the parent object
  let current = updatedStructure;
  let lastKey: number | string = editingPath.value[editingPath.value.length - 1];

  // Navigate to the correct position
  for (let i = 0; i < editingPath.value.length - 1; i++) {
    const key = editingPath.value[i];
    if (key === 'structure_fields') {
      current = current.structure_fields;
    } else {
      // Handle array indices (convert to number if needed)
      const parsedKey = !isNaN(Number(key)) ? Number(key) : key;
      current = current[parsedKey];
    }
  }

  // Convert lastKey to number if it's an array index
  lastKey = !isNaN(Number(lastKey)) ? Number(lastKey) : lastKey;

  // Get the original value to determine type
  let originalValue: any = props.structure;
  for (let i = 0; i < editingPath.value.length; i++) {
    const key = editingPath.value[i];
    if (originalValue === undefined) break;

    if (key === 'structure_fields') {
      originalValue = originalValue.structure_fields;
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

  // Emit the updated structure
  emit('update:structure', updatedStructure);

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

// Function to get the full path string for debug display
const getPathString = (path: string[]) => {
  return path.join('.');
};

// Helper function to get field type display
const getFieldTypeDisplay = (fieldType: string) => {
  switch (fieldType) {
    case 'string': return 'Text';
    case 'number': return 'Number';
    case 'boolean': return 'Yes/No';
    case 'date': return 'Date';
    case 'reference': return 'Reference';
    default: return fieldType;
  }
};
</script>

<template>
  <v-card class="structure-viewer">
    <v-card-title class="text-h6">
      {{ structureMetadata?.title || 'No Structure Selected' }}
    </v-card-title>

    <v-card-subtitle v-if="structureMetadata">
      Fields: {{ structureMetadata.fieldCount }}
    </v-card-subtitle>

    <v-card-text>
      <!-- Structure metadata -->
      <v-sheet 
        class="mb-4 pa-3 rounded bg-grey-lighten-4"
        v-if="props.structure"
      >
        <div class="d-flex align-center">
          <div class="mr-4">
            <span class="font-weight-medium">ID:</span> 
            <span class="ml-1">{{ props.structure._id }}</span>
          </div>

          <span v-if="editingPath.length > 0" class="ml-auto text-caption">
            Editing: {{ getPathString(editingPath) }}
          </span>
        </div>
      </v-sheet>

      <!-- Structure fields list -->
      <v-list v-if="props.structure?.fields" class="content-list">
        <v-list-subheader>Structure Fields</v-list-subheader>

        <template v-for="(field, index) in props.structure.fields" :key="index">
          <v-list-item class="content-item">
            <template v-slot:prepend>
              <v-icon
                :icon="'mdi-file-document'"
                :color="'blue'"
              ></v-icon>
            </template>

            <v-list-item-title class="mr-4">
              {{ field.name }}:
            </v-list-item-title>

            <!-- Field type display -->
            <v-list-item-subtitle class="flex-grow-1">
              <!-- If currently editing this value -->
              <template v-if="isEditing(['structure_fields', index.toString(), 'fieldType'])">
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

              <!-- Normal display with edit button -->
              <template v-else>
                <div class="d-flex align-center">
                  <span class="type-string">
                    {{ getFieldTypeDisplay(field.type) }}
                  </span>

                  <!-- Edit button (only for admins) -->
                  <v-btn
                    v-if="props.isAdmin"
                    icon="mdi-pencil"
                    size="x-small"
                    variant="text"
                    color="primary"
                    class="ml-2"
                    @click.stop="startEditing(['structure_fields', index.toString(), 'fieldType'], field.type)"
                  ></v-btn>
                </div>
              </template>
            </v-list-item-subtitle>

            <!-- Reference field if applicable -->
            <v-list-item-subtitle v-if="field.reference" class="ml-4">
              <span class="text-caption">Reference ID: {{ field.reference }}</span>
            </v-list-item-subtitle>
          </v-list-item>

          <v-divider></v-divider>
        </template>
      </v-list>

      <div v-if="!props.structure?.fields || props.structure.fields.length === 0" class="text-center pa-4">
        No fields defined in this structure
      </div>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.structure-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.content-list {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 16px;
}

.content-item {
  transition: background-color 0.2s ease;
}

.content-item:hover {
  background-color: rgba(0, 0, 0, 0.03);
}

.type-string {
  color: #008000;
}

.type-number {
  color: #0000FF;
}

.type-boolean {
  color: #FF00FF;
}

.type-undefined, .type-object {
  color: #999;
  font-style: italic;
}

.cursor-pointer {
  cursor: pointer;
}

.edit-field {
  font-size: 14px;
}
</style>
