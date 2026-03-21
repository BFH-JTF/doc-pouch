<script setup lang="ts">
import {computed, ref, watch} from 'vue';
import type {I_DocumentType, I_StructureEntry} from 'docpouch-client';

const props = defineProps<{
  displayedTypeID: string | null;
  typeList: I_DocumentType[];
  structureList: I_StructureEntry[];
}>();

const emit = defineEmits<{
  (event: 'update:type', value: I_DocumentType): void;
}>();

let newType = ref<I_DocumentType>({
  _id: "",
  name: "",
  type: -1,
  subType: -1,
  description: "",
  defaultStructureID: ""
})

watch(() => props.displayedTypeID, (newVal) => {
  const foundType = props.typeList.find(type => type._id === newVal);

  if (foundType) {
    newType.value = foundType;
  } else {
    newType.value = {
      _id: "",
      name: "",
      type: -1,
      subType: -1,
      description: "",
      defaultStructureID: ""
    };
  }
}, {immediate: true});

let existingDefaultStructures = computed(() => {
  let selection: { title: string, value: string }[];
  if (props.structureList.length > 0) {
    selection = props.structureList.map(structure => {
      return {
        title: structure.name,
        value: structure._id as string
      }
    });
    return selection;
  }
})

let existingOtherTypes = computed(() => {
  if (props.typeList.length > 0) {
    return props.typeList
        .filter(type => type.type !== newType.value.type)
        .map(type => ({
          title: `${type.name} (${type.type})`,
          value: type._id as string
        }));
  }
  return [];
});


let selectedTypeID = ref<string | null>(null);

function updateType(newType: I_DocumentType) {
  emit('update:type', newType);
}

function moveType(freshType: number, typeDocument: I_DocumentType) {
  const existingSubtypesForType = props.typeList
      .filter(type => type.type === freshType)
      .map(type => type.subType);

  let newSubType = 0;
  while (existingSubtypesForType.includes(newSubType)) {
    newSubType++;
  }

  newType.value = {
    ...typeDocument,
    type: freshType,
    subType: newSubType
  };

  updateType(newType.value);
}
</script>

<template>
  <v-card class="type-display">
    <v-card-title>Type Details</v-card-title>
    <v-card-text>
      <v-container>
        <v-row>
          <!-- ID field (read-only) -->
          <v-col cols="12">
            <v-text-field
                label="ID"
                v-model="newType._id"
                variant="outlined"
                density="compact"
                readonly
            ></v-text-field>
          </v-col>

          <!-- Name field -->
          <v-col cols="12">
            <v-text-field
                label="Name"
                v-model="newType.name"
                variant="outlined"
                density="compact"
                @change="updateType(newType)"
            ></v-text-field>
          </v-col>

          <!-- Description field -->
          <v-col cols="12">
            <v-textarea
                label="Description"
                v-model="newType.description"
                variant="outlined"
                density="compact"
                @change="updateType(newType)"
            ></v-textarea>
          </v-col>

          <!-- DefaultStructure field -->
          <v-col class="v-col-12">
            <v-select
                label="Default Document Structure"
                :items="existingDefaultStructures"
                variant="outlined"
                density="compact"
                v-model="newType.defaultStructureID"
                @change="updateType(newType)"
                autocomplete="off"
            />
          </v-col>

          <!-- Type field -->
          <v-card class="type-display" width="100%">
            <v-card-text>
              <v-col class="v-col-12 pb-0 mb-0">
                <v-select
                    label="[move to other type]"
                    :items="existingOtherTypes"
                    variant="outlined"
                    density="compact"
                    v-model="selectedTypeID"
                    @change="moveType"
                    autocomplete="off"
                />
              </v-col>
              <v-col class="v-col-12 d-flex justify-end pt-0 mt-0">
                <v-btn :disabled="selectedTypeID === null" variant="outlined" density="compact">Move</v-btn>
              </v-col>
            </v-card-text>
          </v-card>

        </v-row>
      </v-container>
    </v-card-text>
  </v-card>
</template>