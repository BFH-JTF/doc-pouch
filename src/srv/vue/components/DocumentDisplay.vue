<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type { I_DocumentEntry } from "../types.js";

const props = defineProps<{
  object: I_DocumentEntry | undefined;
  id: string;
}>();

const emit = defineEmits<{
  'update:object': [updatedObject: I_DocumentEntry | undefined];
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

// Check if we're currently editing a path
const isEditing = (path: string[]) => {
  if (editingPath.value.length !== path.length) return false;

  return path.every((segment, index) => segment === editingPath.value[index]);
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
    <v-card-title class="text-h6">
      {{ props.object?.title }}
    </v-card-title>

    <v-card-text>
      <!-- Replace the debug info with document metadata -->
      <v-sheet 
        class="mb-4 pa-3 rounded bg-grey-lighten-4"
        v-if="props.object"
      >
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
            <div class="mr-4 d-flex align-center">
              <span class="font-weight-medium">Type:</span> 

              <!-- Type editing -->
              <template v-if="isEditing(['type'])">
                <div class="d-flex align-center ml-2">
                  <v-text-field
                    v-model="editingValue"
                    density="compact"
                    hide-details
                    variant="outlined"
                    class="edit-field"
                    type="number"
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
              <div v-else class="d-flex align-center ml-1">
                <span>{{ props.object.type }}</span>
                <v-btn
                  icon="mdi-pencil"
                  size="x-small"
                  variant="text"
                  color="primary"
                  class="ml-2"
                  @click.stop="startEditing(['type'], props.object.type)"
                ></v-btn>
              </div>
            </div>

            <div class="mr-4 d-flex align-center">
              <span class="font-weight-medium">Subtype:</span> 

              <!-- Subtype editing -->
              <template v-if="isEditing(['subType'])">
                <div class="d-flex align-center ml-2">
                  <v-text-field
                    v-model="editingValue"
                    density="compact"
                    hide-details
                    variant="outlined"
                    class="edit-field"
                    type="number"
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
              <div v-else class="d-flex align-center ml-1">
                <span>{{ props.object.subType }}</span>
                <v-btn
                  icon="mdi-pencil"
                  size="x-small"
                  variant="text"
                  color="primary"
                  class="ml-2"
                  @click.stop="startEditing(['subType'], props.object.subType)"
                ></v-btn>
              </div>
            </div>

            <span v-if="editingPath.length > 0" class="ml-auto text-caption">
              Editing: {{ getPathString(editingPath) }}
            </span>
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
                  <span 
                    v-if="typeof value !== 'object' || value === null"
                    :class="`type-${typeof value}`"
                  >
                    {{ value === null ? 'null' : value }}
                  </span>
                  <span v-else>
                    {{ Array.isArray(value) ? `Array (${value.length})` : 'Object' }}
                  </span>

                  <!-- Edit button for primitive values -->
                  <v-btn
                    v-if="typeof value !== 'object' || value === null"
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
                      <span 
                        v-if="typeof item !== 'object' || item === null"
                        :class="`type-${typeof item}`"
                      >
                        {{ item === null ? 'null' : item }}
                      </span>
                      <span v-else>
                        {{ Array.isArray(item) ? `Array (${item.length})` : 'Object' }}
                      </span>

                      <!-- Edit button for primitive values -->
                      <v-btn
                        v-if="typeof item !== 'object' || item === null"
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
                      <span 
                        v-if="typeof nestedValue !== 'object' || nestedValue === null"
                        :class="`type-${typeof nestedValue}`"
                      >
                        {{ nestedValue === null ? 'null' : nestedValue }}
                      </span>
                      <span v-else>
                        {{ Array.isArray(nestedValue) ? `Array (${nestedValue.length})` : 'Object' }}
                      </span>

                      <!-- Edit button for primitive values -->
                      <v-btn
                        v-if="typeof nestedValue !== 'object' || nestedValue === null"
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

.raw-json {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
}
</style>
