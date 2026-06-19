<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type {I_DataStructure, I_StructureField} from "docpouch-client";
import {
  diffStructures,
  isStructureMetadataChange,
  type IStructureDiff,
} from "./structurePropagation/index.ts";

const props = defineProps<{
  displayStructure: I_DataStructure | undefined;
  structureList: I_DataStructure[];
  isAdmin: boolean;
  affectedDocumentsCount: number;
}>();

const emit = defineEmits<{
  'update:structure': [updatedStructure: I_DataStructure];
  'save-requested': [payload: {
    newStructure: I_DataStructure;
    previousStructure: I_DataStructure | undefined;
    diff: IStructureDiff;
    affectedDocumentsCount: number;
  }];
}>();

const fieldTypes = ['string', 'number', 'boolean', 'array', 'structure'];
const primitiveTypes = ['string', 'number', 'boolean'];
const arrayItemTypes = ['string', 'number', 'boolean', 'structure'];

function getArrayItemCategory(field: I_StructureField): string {
  if ((field as any)._arrayCategory) return (field as any)._arrayCategory;
  if (field.items === undefined || field.items === null) return 'string';
  if (field.items === '') return 'structure';
  if (primitiveTypes.includes(field.items)) return field.items;
  return 'structure';
}

const isDuplicateTypeSubtype = computed(() => {
  if (!editableStructure.value || editableStructure.value.type === undefined || editableStructure.value.subType === undefined) {
    return false;
  }
  return props.structureList.some(s =>
      s._id !== editableStructure.value!._id &&
      s.type === editableStructure.value!.type &&
      s.subType === editableStructure.value!.subType
  );
});

const keyNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const formValid = computed(() => {
  if (!editableStructure.value) {
    return false;
  }
  if (isDuplicateTypeSubtype.value) {
    return false;
  }
  if (editableStructure.value.fields.some(f => !f.name || !keyNamePattern.test(f.name))) {
    return false;
  }
  return true;
});

const editableStructure = ref<I_DataStructure | undefined>(undefined);

watch(() => props.displayStructure?._id, () => {
  editableStructure.value = props.displayStructure ? JSON.parse(JSON.stringify(props.displayStructure)) : undefined;
}, {immediate: true});

function updateStructure() {
  if (editableStructure.value && !isDuplicateTypeSubtype.value) {
    const structure = JSON.parse(JSON.stringify(editableStructure.value)) as I_DataStructure;
    for (const field of structure.fields) {
      if (field.items === '') {
        field.items = undefined;
      }
      delete (field as any)._arrayCategory;
    }
    const previousStructure = props.displayStructure
        ? JSON.parse(JSON.stringify(props.displayStructure)) as I_DataStructure
        : undefined;
    const diffResult = diffStructures(previousStructure, structure);
    const onlyMetadataChange = !diffResult.hasStructuralChange
        && isStructureMetadataChange(previousStructure, structure);
    if (onlyMetadataChange || props.affectedDocumentsCount === 0) {
      emit('update:structure', structure);
    } else {
      emit('save-requested', {
        newStructure: structure,
        previousStructure,
        diff: diffResult,
        affectedDocumentsCount: props.affectedDocumentsCount,
      });
    }
  }
}

function addField() {
  if (!editableStructure.value) return;
  if (!editableStructure.value.fields) {
    editableStructure.value.fields = [];
  }
  editableStructure.value.fields.push({
    name: "",
    displayName: "",
    type: "string",
    items: undefined
  });
  updateStructure();
}

function removeField(index: number) {
  if (!editableStructure.value?.fields) return;
  editableStructure.value.fields.splice(index, 1);
  updateStructure();
}

function handleFieldTypeChange(field: I_StructureField, newType: string) {
  if (newType !== 'array' && newType !== 'structure') {
    field.items = undefined;
    delete (field as any)._arrayCategory;
  } else if (newType === 'array') {
    field.items = 'string';
    (field as any)._arrayCategory = 'string';
  } else if (newType === 'structure') {
    field.items = undefined;
    delete (field as any)._arrayCategory;
  }
}

function handleArrayItemCategoryChange(field: I_StructureField, category: string) {
  (field as any)._arrayCategory = category;
  if (category === 'structure') {
    field.items = '';
  } else {
    field.items = category;
    updateStructure();
  }
}

// Tree item interface for Vuetify tree view
interface I_StructureTreeItem {
  name: string;
  id: string;
  children?: I_StructureTreeItem[];
  icon?: string;
  color?: string;
}

// Map data types to their corresponding icons and colors
interface IconEntry {
  icon: string;
  color: string;
}

// Define the exact shape of typeIcons
const typeIcons: Record<string, IconEntry> = {
  string: { icon: 'mdi-format-quote-close', color: 'success' },
  number: { icon: 'mdi-numeric', color: 'info' },
  boolean: { icon: 'mdi-toggle-switch-outline', color: 'purple' },
  array: { icon: 'mdi-format-list-bulleted-square', color: 'warning' },
  structure: { icon: 'mdi-database', color: 'primary' },
  default: { icon: 'mdi-help-circle-outline', color: 'grey' }
};

// Function to get the type icon with a proper key assertion
function getTypeIcon(type: string): IconEntry {
  return (typeIcons as Record<string, IconEntry>)[type] || typeIcons.default;
}

const treeItems = computed(() => {
  if (!props.displayStructure) return [];
  
  // Create a root item for the structure
  const rootItem: I_StructureTreeItem = {
    name: props.displayStructure.name,
    id: props.displayStructure._id || "root",
    children: [],
    icon: 'mdi-folder-table',
    color: 'amber'
  };
  
  // Add each field as a child
  if (props.displayStructure.fields && props.displayStructure.fields.length > 0) {
    rootItem.children = props.displayStructure.fields.map(field => createFieldNode(field));
  }
  
  return [rootItem]; // Return as an array with a single root item
});

function createFieldNode(field: I_StructureField): I_StructureTreeItem {
  // Create the node for this field
  const node: I_StructureTreeItem = {
    name: `${field.displayName} [${field.name}]`,
    id: field.name,
    children: []
  };
  
  // Add type information and corresponding icon
  switch (field.type) {
    case 'string':
    case 'number':
    case 'boolean':
      const typeInfo = typeIcons[field.type];
      node.icon = typeInfo.icon;
      node.color = typeInfo.color;
      break;
      
    case 'array':
      node.icon = typeIcons.array.icon;
      node.color = typeIcons.array.color;
      
      if (field.items === 'string' || field.items === 'number' || field.items === 'boolean') {
        node.name = `${field.displayName} [${field.name}] (Array of ${field.items})`;
        const itemTypeInfo = typeIcons[field.items] || typeIcons.default;
      } else if (field.items) {
        const referencedStructure = props.structureList.find(s => s._id === field.items);
        if (referencedStructure) {
          node.name = `${field.displayName} [${field.name}] (${referencedStructure.name})`;
          if (!node.children)
            node.children = [];
          if (referencedStructure.fields && referencedStructure.fields.length > 0) {
            node.children = referencedStructure.fields.map(childField =>
              createFieldNode(childField)
            );
          }
        } else {
          node.name = `${field.displayName} [${field.name}] (Array of structures)`;
          node.children = [{
            name: `Unknown Structure (ID: ${field.items})`,
            id: `${node.id}.unknown-${field.items}`,
            icon: 'mdi-alert-circle-outline',
            color: 'grey'
          }];
        }
      }
      break;
      
    case 'structure':
      node.icon = typeIcons.structure.icon;
      node.color = typeIcons.structure.color;
      
      if (field.items) {
        const referencedStructure = props.structureList.find(s => s._id === field.items);
        if (referencedStructure) {
          node.name = `${field.displayName} [${field.name}] (${referencedStructure.name})`;
          if (!node.children)
            node.children = [];
          if (referencedStructure.fields && referencedStructure.fields.length > 0) {
            node.children = referencedStructure.fields.map(childField =>
              createFieldNode(childField)
            );
          }
        } else {
          node.name = `${field.displayName} [${field.name}]`;
          node.children = [{
            name: `Unknown Structure (ID: ${field.items})`,
            id: `${node.id}.unknown-${field.items}`,
            icon: 'mdi-alert-circle-outline',
            color: 'grey'
          }];
        }
      } else {
        node.name = `${field.displayName} [${field.name}]`;
      }
      break;
      
    default:
      node.icon = typeIcons.default.icon;
      node.color = typeIcons.default.color;
  }
  
  return node;
}

// Debug log to check what's in the treeItems
watch(treeItems, (newItems) => {
  console.log("Tree items updated:", newItems);
}, { immediate: true });
</script>

<template>
  <v-card class="structure-viewer">
    <v-card-title class="text-h6">
      {{ props.displayStructure?.name || 'No Structure Selected' }}
    </v-card-title>

    <v-card-text>
      <v-sheet class="mb-4 pa-3 rounded bg-grey-lighten-4" v-if="props.displayStructure">
        <div class="d-flex flex-column">
          <div class="mb-3">
            <span class="font-weight-medium">ID:</span>
            <span class="ml-1">{{ props.displayStructure._id }}</span><br>
            <span class="ml-1">{{ props.displayStructure?.description }}</span>
          </div>

          <v-row v-if="editableStructure" class="mb-3" dense>
            <v-col cols="12" md="6">
              <v-text-field
                  v-model="editableStructure.name"
                  :readonly="!props.isAdmin"
                  density="compact"
                  hide-details
                  label="Name"
                  variant="outlined"
                  @change="updateStructure"
              ></v-text-field>
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                  v-model.number="editableStructure.type"
                  :readonly="!props.isAdmin"
                  density="compact"
                  :error="isDuplicateTypeSubtype"
                  :error-messages="isDuplicateTypeSubtype ? 'Type/subtype combination already exists' : ''"
                  label="Type"
                  type="number"
                  variant="outlined"
                  @change="updateStructure"
              ></v-text-field>
            </v-col>
            <v-col cols="6" md="3">
              <v-text-field
                  v-model.number="editableStructure.subType"
                  :readonly="!props.isAdmin"
                  density="compact"
                  :error="isDuplicateTypeSubtype"
                  :error-messages="isDuplicateTypeSubtype ? 'Type/subtype combination already exists' : ''"
                  label="Subtype"
                  type="number"
                  variant="outlined"
                  @change="updateStructure"
              ></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-textarea
                  v-model="editableStructure.description"
                  :readonly="!props.isAdmin"
                  density="compact"
                  hide-details
                  label="Description"
                  rows="2"
                  variant="outlined"
                  @change="updateStructure"
              ></v-textarea>
            </v-col>
          </v-row>

          <!-- Ensure the tree container has proper styling -->
          <div class="structure-tree-container">
            <div class="d-flex align-center mb-2">
              <h3 class="text-subtitle-1 mr-auto">Structure Hierarchy</h3>

              <!-- Legend for type icons -->
              <div class="d-flex flex-wrap justify-end type-legend">
                <div class="legend-item">
                  <v-icon size="small" color="success">{{ typeIcons.string.icon }}</v-icon>
                  <span class="legend-label">String</span>
                </div>
                <div class="legend-item">
                  <v-icon size="small" color="info">{{ typeIcons.number.icon }}</v-icon>
                  <span class="legend-label">Number</span>
                </div>
                <div class="legend-item">
                  <v-icon size="small" color="purple">{{ typeIcons.boolean.icon }}</v-icon>
                  <span class="legend-label">Boolean</span>
                </div>
                <div class="legend-item">
                  <v-icon size="small" color="warning">{{ typeIcons.array.icon }}</v-icon>
                  <span class="legend-label">Array</span>
                </div>
                <div class="legend-item">
                  <v-icon size="small" color="primary">{{ typeIcons.structure.icon }}</v-icon>
                  <span class="legend-label">Structure</span>
                </div>
              </div>
            </div>

            <v-treeview
              :items="treeItems"
              activatable
              :open="true"
              rounded
              hoverable
              dense
              class="structure-tree"
              item-key="id"
              item-children="children"
              item-text="name"
              hide-icons
            >
              <template v-slot:prepend="{ item }">
                <div style="display:flex; align-items:center;">
                  <span>{{ item.name }}</span>
                </div>

              </template>
              <template v-slot:append="{ item }">
                <v-icon :icon="item.icon" :color="item.color"></v-icon>
              </template>
            </v-treeview>
          </div>
        </div>
      </v-sheet>

      <!-- Editable Structure fields list -->
      <v-card v-if="editableStructure" class="mt-4" variant="outlined">
        <v-card-title class="text-subtitle-1 py-2">
          Structure Fields
          <v-spacer></v-spacer>
          <v-btn
              v-if="props.isAdmin"
              color="primary"
              prepend-icon="mdi-plus"
              size="small"
              @click="addField"
          >
            Add Field
          </v-btn>
        </v-card-title>
        <v-card-text class="pt-0">
          <v-list v-if="editableStructure.fields && editableStructure.fields.length > 0" lines="two">
            <template v-for="(field, index) in editableStructure.fields" :key="index">
              <v-list-item>
                <template v-slot:prepend>
                  <v-icon :color="typeIcons[field.type]?.color || typeIcons.default.color"
                          :icon="typeIcons[field.type]?.icon || typeIcons.default.icon"></v-icon>
                </template>

                <v-list-item-title class="structure-field-title">
                  <v-text-field
                      v-model="field.name"
                      :readonly="!props.isAdmin"
                      :rules="props.isAdmin ? [v => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v) || 'Only letters, digits, underscores; must start with a letter or underscore'] : []"
                      class="mr-2"
                      density="comfortable"
                      label="Key Name"
                      variant="outlined"
                      @change="updateStructure"
                  ></v-text-field>
                  <v-text-field
                      v-model="field.displayName"
                      :readonly="!props.isAdmin"
                      density="comfortable"
                      hide-details
                      label="Display Name"
                      variant="outlined"
                      @change="updateStructure"
                  ></v-text-field>
                </v-list-item-title>

                <v-list-item-subtitle>
                  <v-row class="align-center mt-1" no-gutters>
                    <v-col cols="4">
                      <v-select
                          v-model="field.type"
                          :items="fieldTypes"
                          :readonly="!props.isAdmin"
                          density="comfortable"
                          hide-details
                          label="Type"
                          variant="outlined"
                          @update:model-value="(val: string) => { handleFieldTypeChange(field, val); updateStructure(); }"
                      ></v-select>
                    </v-col>

                    <v-col v-if="field.type === 'array' || field.type === 'structure'" class="pl-2" cols="4">
                      <v-select
                          v-if="field.type === 'structure'"
                          :items="props.structureList.filter(s => s._id !== editableStructure!._id)"
                          :model-value="field.items"
                          :readonly="!props.isAdmin"
                          clearable
                          density="compact"
                          hide-details
                          item-title="name"
                          item-value="_id"
                          label="Referenced Structure"
                          variant="outlined"
                          @update:model-value="(val: string | null) => { field.items = val ?? undefined; updateStructure(); }"
                      ></v-select>
                      <template v-else-if="field.type === 'array'">
                        <v-select
                            :items="arrayItemTypes"
                            :model-value="getArrayItemCategory(field)"
                            :readonly="!props.isAdmin"
                            density="compact"
                            hide-details
                            label="Array Item Type"
                            variant="outlined"
                            @update:model-value="(val: string) => { handleArrayItemCategoryChange(field, val); }"
                        ></v-select>
                        <v-select
                            v-if="getArrayItemCategory(field) === 'structure'"
                            :items="props.structureList.filter(s => s._id !== editableStructure!._id)"
                            :model-value="field.items || null"
                            :readonly="!props.isAdmin"
                            clearable
                            density="compact"
                            hide-details
                            item-title="name"
                            item-value="_id"
                            label="Referenced Structure"
                            variant="outlined"
                            @update:model-value="(val: string | null) => { field.items = val ?? ''; updateStructure(); }"
                        ></v-select>
                      </template>
                    </v-col>

                    <v-col v-if="props.isAdmin" class="pl-2" cols="2">
                      <v-btn
                          color="error"
                          icon="mdi-delete"
                          size="small"
                          variant="text"
                          @click="removeField(index)"
                      ></v-btn>
                    </v-col>
                  </v-row>
                </v-list-item-subtitle>
              </v-list-item>
              <v-divider v-if="index < editableStructure.fields.length - 1"></v-divider>
            </template>
          </v-list>

          <div v-else class="text-center text-grey pa-4">
            No fields defined. Click "Add Field" to add a field to this structure.
          </div>
        </v-card-text>
      </v-card>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.structure-viewer {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.structure-tree-container {
  min-height: 200px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 12px;
  margin-bottom: 16px;
  background-color: white;
}

.structure-tree {
  max-height: 400px;
  overflow-y: auto;
}

.type-legend {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  margin-left: 8px;
}

.legend-label {
  font-size: 12px;
  margin-left: 4px;
  color: rgba(0, 0, 0, 0.6);
}

.structure-fields {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  margin-bottom: 16px;
}

.field-item {
  transition: background-color 0.2s ease;
}

.field-item:hover {
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

/* Structure Fields Layout Fixes */
.structure-field-title {
  margin-bottom: 20px;
  padding-top: 16px;
}

.v-text-field, .v-select {
  margin-top: 16px;
  margin-bottom: 8px;
}

.v-text-field :deep(.v-label), .v-select :deep(.v-label) {
  top: 16px !important;
  line-height: 1.2 !important;
}

.v-text-field :deep(.v-input__control), .v-select :deep(.v-input__control) {
  min-height: 48px;
}

.v-text-field :deep(.v-field__input), .v-select :deep(.v-field__input) {
  padding-top: 12px !important;
  padding-bottom: 12px !important;
}

.v-text-field :deep(.v-label--floating), .v-select :deep(.v-label--floating) {
  transform: translateY(-24px) scale(0.85) !important;
}
</style>
