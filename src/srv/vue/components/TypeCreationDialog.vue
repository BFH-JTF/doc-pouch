<template>
  <v-dialog v-model="props.show" max-width="700px" persistent>
    <v-card>
      <v-card-title class="headline bg-blue-darken-2 text-white">Create New Document Type</v-card-title>

      <v-card-text class="pt-4">
        <v-container>
          <v-row>
            <!-- Name field (mandatory) -->
            <v-col cols="12">
              <v-text-field
                  v-model="newType.name"
                  :rules="nameRules"
                  label="Name *"
                  variant="outlined"
                  required
                  density="compact"
                  autofocus
              ></v-text-field>
            </v-col>

            <!-- Description field (optional) -->
            <v-col cols="12">
              <v-text-field
                  v-model="newType.description"
                  label="Description"
                  variant="outlined"
                  density="compact"
              ></v-text-field>
            </v-col>

            <!-- Default Structure ID field (optional) -->
            <v-col cols="12">
              <v-select label="Default Document Structure"
                        variant="outlined"
                        density="compact"
                        :items="props.structureList"
                        item-title="name"
                        item-value="_id"
                        v-model="newType.defaultStructureID"
                        clearable
              />


            </v-col>

            <!-- Type Selection Section -->
            <v-col cols="12">
              <v-card variant="outlined" class="mb-2">
                <v-card-title class="text-subtitle-1 py-2">Document Type</v-card-title>
                <v-card-text class="pt-0">

                  <v-radio-group v-model:model-value="newTypeRadio" label="New subtype location:">
                    <v-radio label="In new document type" :value="true"></v-radio>
                    <v-radio v-if="props.typeList.length > 0" label="Use existing document type"
                             :value="false"></v-radio>
                  </v-radio-group>

                  <v-select :model-value="selectedType" v-if="!newTypeRadio"
                            :items="props.typeList.map(type => type.type)"/>
                </v-card-text>
              </v-card>
            </v-col>

            <!-- Existing SubTypes -->
            <v-col v-if="!newTypeRadio" cols="12">
              <v-card variant="outlined" class="mb-2">
                <v-card-title class="text-subtitle-1 py-2">Existing subtypes</v-card-title>
                <v-card-text class="pt-0">
                  <v-list lines="one">
                    <v-list-item v-for="type in props.typeList.filter(type => type.type === selectedType)">
                      {{ type.type }}: {{ type.name }}
                    </v-list-item>
                  </v-list>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
        <v-container>

        </v-container>
      </v-card-text>

      <v-card-actions class="pb-4 px-4">
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="cancelDialog">Cancel</v-btn>
        <v-btn
            color="primary"
            :disabled="!formValid"
            @click="handleTypeCreation"
        >
          Create
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue';
import type {I_DocumentType, I_StructureEntry} from 'docpouch-client';

const props = defineProps<{
  typeList: I_DocumentType[];
  structureList: I_StructureEntry[];
  show?: boolean;
}>();

const emit = defineEmits<{
  (e: 'cancelDialog'): void;
  (e: 'typeCreated', type: I_DocumentType): void;
}>();

const formValid = computed(() => {
  if (newTypeRadio.value) {
    if (!newType.value.name) {
      return false;
    }
  } else if (selectedType.value === null) {
    return false;
  }
  return true;
});
const newTypeRadio = ref(true);
const newType = ref<I_DocumentType>({
  name: "",
  type: 0,
  subType: 0,
  description: "",
  defaultStructureID: ""
});

// Validation rules
const nameRules = [
  (v: string) => !!v || 'Name is required',
];

let selectedType = ref<number | null>(null);

function handleTypeCreation() {
  if (newTypeRadio.value) {
    if (props.typeList.length === 0)
      newType.value.type = 0;
    else
      newType.value.type = 1 + Math.max(...props.typeList.map(type => type.type));
    newType.value.subType = 0;
  } else if (selectedType.value !== null) {
    // add subtype to existing type
    newType.value.type = selectedType.value;
    newType.value.subType = 1 + Math.max(...props.typeList.filter(type => type.type === selectedType.value).map(type => type.subType));
  } else {
    return
  }
  emit('typeCreated', newType.value);
}

function cancelDialog() {
  emit('cancelDialog');
}

onMounted(() => {
  if (props.typeList.length > 0) {
    selectedType.value = props.typeList[0].type;
  }
});

</script>

<style scoped>
.existing-type-item, .existing-subtype-item {
  cursor: pointer;
  transition: background-color 0.2s;
}

.existing-type-item:hover, .existing-subtype-item:hover {
  background-color: rgba(0, 0, 0, 0.05);
}

.existing-type-item:active, .existing-subtype-item:active {
  background-color: rgba(0, 0, 0, 0.1);
}
</style>