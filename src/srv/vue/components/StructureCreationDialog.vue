<template>
  <v-dialog v-model="props.show" max-width="800px" persistent>
    <v-card>
      <v-card-title class="headline bg-primary text-white">
        Create New Document Structure
      </v-card-title>

      <v-card-text class="pt-4">
        <v-container>
          <v-row>
            <!-- Name field (mandatory) -->
            <v-col cols="12" md="6">
              <v-text-field
                  v-model="newStructure.name"
                  :rules="nameRules"
                  autofocus
                  density="compact"
                  label="Structure Name *"
                  required
                  variant="outlined"
              ></v-text-field>
            </v-col>

            <!-- Type field -->
            <v-col cols="12" md="3">
              <v-text-field
                  v-model.number="newStructure.type"
                  :error="isDuplicateTypeSubtype"
                  :rules="typeSubtypeRules"
                  density="compact"
                  label="Type"
                  type="number"
                  variant="outlined"
              ></v-text-field>
            </v-col>

            <!-- SubType field -->
            <v-col cols="12" md="3">
              <v-text-field
                  v-model.number="newStructure.subType"
                  :error="isDuplicateTypeSubtype"
                  :rules="typeSubtypeRules"
                  density="compact"
                  label="Subtype"
                  type="number"
                  variant="outlined"
              ></v-text-field>
            </v-col>

            <!-- Description field (optional) -->
            <v-col cols="12">
              <v-textarea
                  v-model="newStructure.description"
                  density="compact"
                  label="Description"
                  rows="2"
                  variant="outlined"
              ></v-textarea>
            </v-col>
          </v-row>

          <!-- Fields section -->
          <v-row>
            <v-col cols="12">
              <v-card variant="outlined">
                <v-card-title class="text-subtitle-1 py-2">
                  Structure Fields
                  <v-spacer></v-spacer>
                  <v-btn
                      color="primary"
                      prepend-icon="mdi-plus"
                      size="small"
                      @click="addField"
                  >
                    Add Field
                  </v-btn>
                </v-card-title>
                <v-card-text class="pt-0">
                  <div v-if="newStructure.fields.length === 0" class="text-center text-grey pa-4">
                    No fields defined. Click "Add Field" to add a field to this structure.
                  </div>

                  <v-list v-else class="structure-fields-list" lines="two">
                    <template v-for="(field, index) in newStructure.fields" :key="index">
                      <v-list-item class="structure-field-item">
                        <template v-slot:prepend>
                          <v-avatar color="primary" size="32">
                            <v-icon icon="mdi-table-column"></v-icon>
                          </v-avatar>
                        </template>

                        <v-list-item-title class="structure-field-title">
                          <v-text-field
                              v-model="field.name"
                              class="mr-2"
                              density="compact"
                              hide-details
                              label="Field Name"
                              variant="outlined"
                          ></v-text-field>
                        </v-list-item-title>

                        <v-list-item-subtitle class="structure-field-subtitle">
                          <v-row class="align-center" no-gutters>
                            <v-col cols="4">
                              <v-select
                                  v-model="field.type"
                                  :items="fieldTypes"
                                  density="compact"
                                  hide-details
                                  label="Type"
                                  variant="outlined"
                                  @update:model-value="(val: string) => handleTypeChange(field, val)"
                              ></v-select>
                            </v-col>

                            <v-col v-if="field.type === 'array' || field.type === 'structure'" class="pl-2" cols="4">
                              <v-select
                                  v-if="field.type === 'structure'"
                                  v-model="field.items"
                                  :items="props.structureList"
                                  clearable
                                  density="compact"
                                  hide-details
                                  item-title="name"
                                  item-value="_id"
                                  label="Referenced Structure"
                                  variant="outlined"
                              ></v-select>
                              <v-select
                                  v-else-if="field.type === 'array'"
                                  v-model="field.items"
                                  :items="primitiveTypes"
                                  clearable
                                  density="compact"
                                  hide-details
                                  label="Array Item Type"
                                  variant="outlined"
                              ></v-select>
                            </v-col>

                            <v-col class="pl-2 text-right" cols="2">
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
                      <v-divider v-if="index < newStructure.fields.length - 1"></v-divider>
                    </template>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
      </v-card-text>

      <v-card-actions class="pb-4 px-4">
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="cancelDialog">Cancel</v-btn>
        <v-btn
            :disabled="!formValid"
            color="primary"
            @click="handleStructureCreation"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {ref, computed, watch} from 'vue';
import type {I_DataStructure, I_StructureField} from 'docpouch-client';

const props = defineProps<{
  structureList: I_DataStructure[];
  show?: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancelDialog'): void;
  (e: 'structureCreated', structure: I_DataStructure): void;
}>();

const fieldTypes = ['string', 'number', 'boolean', 'array', 'structure'];
const primitiveTypes = ['string', 'number', 'boolean'];

const newStructure = ref<I_DataStructure>({
  _id: undefined,
  name: "",
  type: 0,
  subType: 0,
  description: "",
  fields: []
});

// Validation rules
const nameRules = [
  (v: string) => !!v || 'Name is required',
];

const typeSubtypeRules = computed(() => {
  return [(v: number) => !isDuplicateTypeSubtype.value || 'This type/subtype combination is already in use'];
});

const isDuplicateTypeSubtype = computed(() => {
  if (newStructure.value.type === undefined || newStructure.value.subType === undefined) {
    return false;
  }
  return props.structureList.some(s =>
      s.type === newStructure.value.type &&
      s.subType === newStructure.value.subType
  );
});

const formValid = computed(() => {
  if (!newStructure.value.name) {
    return false;
  }
  if (isDuplicateTypeSubtype.value) {
    return false;
  }
  return true;
});

function addField() {
  newStructure.value.fields.push({
    name: "",
    displayName: "",
    type: "string",
    items: undefined
  });
}

function removeField(index: number) {
  newStructure.value.fields.splice(index, 1);
}

function handleTypeChange(field: I_StructureField, newType: string) {
  if (newType !== 'array' && newType !== 'structure') {
    field.items = undefined;
  } else if (newType === 'array') {
    field.items = 'string';
  } else if (newType === 'structure') {
    field.items = undefined;
  }
}

function handleStructureCreation() {
  emit('structureCreated', {...newStructure.value});
}

function cancelDialog() {
  emit('cancelDialog');
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    newStructure.value = {
      _id: undefined,
      name: "",
      type: props.structureList.length === 0 ? 0 : Math.max(...props.structureList.map(s => s.type)) + 1,
      subType: 0,
      description: "",
      fields: []
    };
  }
}, {immediate: true});
</script>

<style scoped>
.structure-fields-list {
  padding: 8px 0;
}

.structure-field-item {
  min-height: 96px;
  padding: 8px 16px;
}

.structure-field-title {
  margin-bottom: 8px;
}

.structure-field-subtitle {
  padding-left: 40px; /* Account for prepend avatar */
}

.v-text-field, .v-select {
  margin-top: 4px;
  margin-bottom: 4px;
}
</style>
