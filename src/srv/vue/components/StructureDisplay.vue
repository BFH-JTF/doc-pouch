<script setup lang="ts">
import { ref, watch, computed } from "vue";
import type {I_DataStructure, I_StructureField} from "docpouch-client";

const props = defineProps<{
  displayStructure: I_DataStructure | undefined;
  structureList: I_DataStructure[];
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'update:structure': [updatedStructure: I_DataStructure];
}>();

const editableStructure = ref<I_DataStructure | undefined>(undefined);

watch(() => props.displayStructure, (newStructure) => {
  editableStructure.value = newStructure ? JSON.parse(JSON.stringify(newStructure)) : undefined;
}, {immediate: true, deep: true});

function updateStructure() {
  if (editableStructure.value) {
    emit('update:structure', editableStructure.value);
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
        // Add small badge or icon for item type
        const itemTypeInfo = typeIcons[field.items] || typeIcons.default;
      } else if (field.items) {
        node.name = `${field.displayName} [${field.name}] (Array of structures)`;
        
        // Try to find the referenced structure
        const referencedStructure = props.structureList.find(s => s._id === field.items);
        if (!node.children)
          node.children = [];
        if (referencedStructure) {
          // Create a child node for the referenced structure
          const structureNode: I_StructureTreeItem = {
            name: referencedStructure.name,
            id: `${node.id}.${referencedStructure._id}`,
            children: [],
            icon: typeIcons.structure.icon,
            color: typeIcons.structure.color
          };
          
          // Add fields from the referenced structure
          if (referencedStructure.fields && referencedStructure.fields.length > 0) {
            structureNode.children = referencedStructure.fields.map(childField => 
              createFieldNode(childField)
            );
          }
          
          node.children.push(structureNode);
        } else {
          // Referenced structure not found
          node.children.push({
            name: `Unknown Structure (ID: ${field.items})`,
            id: `${node.id}.unknown-${field.items}`,
            icon: 'mdi-alert-circle-outline',
            color: 'grey'
          });
        }
      }
      break;
      
    case 'structure':
      node.name = `${field.name}`;
      node.icon = typeIcons.structure.icon;
      node.color = typeIcons.structure.color;
      
      // Try to find the referenced structure
      if (field.items) {
        const referencedStructure = props.structureList.find(s => s._id === field.items);
        if (!node.children)
          node.children = [];
        if (referencedStructure) {
          // Create a child node for the referenced structure
          const structureNode: I_StructureTreeItem = {
            name: referencedStructure.name,
            id: `${node.id}.${referencedStructure._id}`,
            children: [],
            icon: typeIcons.structure.icon,
            color: typeIcons.structure.color
          };
          
          // Add fields from the referenced structure
          if (referencedStructure.fields && referencedStructure.fields.length > 0) {
            structureNode.children = referencedStructure.fields.map(childField => 
              createFieldNode(childField)
            );
          }
          
          node.children.push(structureNode);
        } else {
          // Referenced structure not found
          node.children.push({
            name: `Unknown Structure (ID: ${field.items})`,
            id: `${node.id}.unknown-${field.items}`,
            icon: 'mdi-alert-circle-outline',
            color: 'grey'
          });
        }
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
                  hide-details
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
                  hide-details
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

      <!-- Structure fields list -->
      <v-list v-if="props.displayStructure?.fields && props.displayStructure.fields.length > 0" class="structure-fields">
        <v-list-subheader>Structure Fields</v-list-subheader>

        <v-list-item v-for="field in props.displayStructure.fields" :key="field.name" class="field-item">
          <template v-slot:prepend>
            <v-icon :icon="typeIcons[field.type].icon" :color="typeIcons[field.type].color"></v-icon>
          </template>

          <v-list-item-title>{{ field.name }}</v-list-item-title>

          <template v-slot:append>
            <v-chip size="small" :color="typeIcons[field.type].color" variant="tonal">
              {{ field.type }}
              <template v-if="field.type === 'array' || field.type === 'structure'">
                <span v-if="field.items" class="ml-1">({{ field.items }})</span>
              </template>
            </v-chip>
          </template>
        </v-list-item>
      </v-list>

      <div v-else-if="props.displayStructure" class="text-center pa-4">
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
</style>
