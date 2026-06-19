<script lang="ts" setup>
import {computed, ref, watch} from "vue";
import type {I_DataStructure, I_StructureField} from "docpouch-client";
import {
  buildPropagationPlan,
  defaultValueForField,
  diffStructures,
  type FieldRenameMap,
  type IStructureDiff,
} from "./structurePropagation/index.ts";

const props = defineProps<{
  show: boolean;
  oldStructure: I_DataStructure | undefined;
  newStructure: I_DataStructure | undefined;
  affectedDocumentsCount: number;
}>();

const emit = defineEmits<{
  "cancel": [];
  "save-structure-only": [];
  "save-and-propagate": [renameMap: FieldRenameMap];
}>();

const diff = computed<IStructureDiff>(() =>
    diffStructures(props.oldStructure, props.newStructure)
);

const newStructureFields = computed<I_StructureField[]>(() => props.newStructure?.fields ?? []);

const renameMap = ref<FieldRenameMap>({});
const propagate = ref<boolean>(true);

watch(
    () => [props.show, diff.value.removedFields.map(f => f.name).join(",")] as const,
    () => {
      const initial: FieldRenameMap = {};
      for (const field of diff.value.removedFields) {
        initial[field.name] = undefined;
      }
      renameMap.value = initial;
    },
    {immediate: true}
);

const renamedFieldPreview = computed(() => {
  return diff.value.removedFields
      .map(removed => {
        const target = renameMap.value[removed.name];
        const valid = !!target && newStructureFields.value.some(f => f.name === target);
        return {
          from: removed.name,
          to: target ?? "",
          valid,
          displayName: removed.displayName || removed.name,
        };
      });
});

const newFieldDefaults = computed(() => {
  return diff.value.addedFields.map(field => ({
    name: field.name,
    displayName: field.displayName || field.name,
    defaultValue: defaultValueForField(field),
  }));
});

const changedFieldEntries = computed(() => {
  return diff.value.changedFields.map(({oldField, newField}) => ({
    name: newField.name,
    displayName: newField.displayName || newField.name,
    oldSignature: `${oldField.type}${oldField.items ? ` of ${oldField.items}` : ""}`,
    newSignature: `${newField.type}${newField.items ? ` of ${newField.items}` : ""}`,
  }));
});

const validRenameTargets = computed(() => {
  return newStructureFields.value
      .map(f => f.name)
      .filter(name => !diff.value.removedFields.some(r => r.name === name));
});

function onTargetChange(oldName: string, newTarget: string | null) {
  renameMap.value = {
    ...renameMap.value,
    [oldName]: newTarget ?? undefined,
  };
}

function previewContentForFirstDoc(): unknown {
  if (!props.newStructure) {
    return null;
  }
  const sample = {exampleField: "exampleValue"};
  return buildPropagationPlan(props.oldStructure, props.newStructure, sample, renameMap.value).newContent;
}

function handleSave() {
  if (!props.newStructure) {
    return;
  }
  if (propagate.value) {
    const cleanedMap: FieldRenameMap = {};
    for (const field of diff.value.removedFields) {
      const target = renameMap.value[field.name];
      if (target && newStructureFields.value.some(f => f.name === target)) {
        cleanedMap[field.name] = target;
      } else {
        cleanedMap[field.name] = undefined;
      }
    }
    emit("save-and-propagate", cleanedMap);
  } else {
    emit("save-structure-only");
  }
}

function handleCancel() {
  emit("cancel");
}
</script>

<template>
  <v-dialog :model-value="props.show" max-width="720px" persistent>
    <v-card>
      <v-card-title class="text-h6 bg-amber-darken-2">
        <v-icon class="mr-2">mdi-alert-circle-outline</v-icon>
        Update existing documents?
      </v-card-title>

      <v-card-text>
        <p class="mb-3">
          The structure
          <strong>{{ props.oldStructure?.name ?? "(unnamed)" }}</strong>
          has structural changes and is currently used by
          <strong>{{ props.affectedDocumentsCount }}</strong>
          document<span v-if="props.affectedDocumentsCount !== 1">s</span>.
        </p>

        <v-alert
            class="mb-3"
            density="compact"
            type="info"
            variant="tonal"
        >
          Choose <em>Update structure only</em> to keep all existing documents untouched.
          Choose <em>Update structure and propagate to documents</em> to align their content with the new structure.
        </v-alert>

        <v-radio-group v-model="propagate" class="mb-3" density="compact" hide-details inline>
          <v-radio :value="false" label="Update structure only"></v-radio>
          <v-radio :value="true" label="Update structure and propagate to documents"></v-radio>
        </v-radio-group>

        <template v-if="propagate">
          <v-divider class="mb-3"></v-divider>

          <div v-if="diff.removedFields.length > 0">
            <h4 class="text-subtitle-1 mb-2">Removed fields</h4>
            <p class="text-caption mb-2">
              For each removed field, choose a field in the new structure to copy its value into.
              If you pick <em>(drop)</em>, the value will be removed from affected documents.
            </p>
            <v-list class="removed-fields-list" density="compact">
              <v-list-item v-for="removed in renamedFieldPreview" :key="removed.from">
                <template v-slot:prepend>
                  <v-icon color="error" icon="mdi-minus-circle-outline"></v-icon>
                </template>
                <v-list-item-title>
                  <strong>{{ removed.displayName }}</strong>
                  <span class="text-caption ml-1">({{ removed.from }})</span>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <v-select
                      :items="[{title: '(drop)', value: null}, ...validRenameTargets.map(t => ({title: t, value: t}))]"
                      :model-value="renameMap[removed.from] ?? null"
                      density="compact"
                      hide-details
                      label="Rename to"
                      variant="outlined"
                      @update:model-value="(val: string | null) => onTargetChange(removed.from, val)"
                  ></v-select>
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>

          <div v-if="diff.addedFields.length > 0" class="mt-3">
            <h4 class="text-subtitle-1 mb-2">Added fields</h4>
            <p class="text-caption mb-2">
              These fields do not exist in existing documents yet. They will be added with the following default values.
            </p>
            <v-list class="added-fields-list" density="compact">
              <v-list-item v-for="added in newFieldDefaults" :key="added.name">
                <template v-slot:prepend>
                  <v-icon color="success" icon="mdi-plus-circle-outline"></v-icon>
                </template>
                <v-list-item-title>
                  <strong>{{ added.displayName }}</strong>
                  <span class="text-caption ml-1">({{ added.name }})</span>
                </v-list-item-title>
                <v-list-item-subtitle>
                  default value:
                  <code>{{ JSON.stringify(added.defaultValue) }}</code>
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>

          <div v-if="diff.changedFields.length > 0" class="mt-3">
            <h4 class="text-subtitle-1 mb-2">Modified fields</h4>
            <p class="text-caption mb-2">
              Existing values for these fields are kept as-is and may not match the new type definition.
            </p>
            <v-list density="compact">
              <v-list-item v-for="changed in changedFieldEntries" :key="changed.name">
                <template v-slot:prepend>
                  <v-icon color="warning" icon="mdi-pencil-circle-outline"></v-icon>
                </template>
                <v-list-item-title>
                  <strong>{{ changed.displayName }}</strong>
                  <span class="text-caption ml-1">({{ changed.name }})</span>
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ changed.oldSignature }} → {{ changed.newSignature }}
                </v-list-item-subtitle>
              </v-list-item>
            </v-list>
          </div>

          <v-expansion-panels v-if="diff.hasStructuralChange" class="mt-3" variant="accordion">
            <v-expansion-panel title="Show preview">
              <template v-slot:text>
                <pre class="preview-json">{{ JSON.stringify(previewContentForFirstDoc(), null, 2) }}</pre>
                <p class="text-caption mt-2">
                  Preview based on a sample document with content
                  <code>{ "exampleField": "exampleValue" }</code>.
                  Each real document will be transformed individually using its own existing values.
                </p>
              </template>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn variant="text" @click="handleCancel">Cancel</v-btn>
        <v-btn color="primary" variant="elevated" @click="handleSave">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.preview-json {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 12px;
  background-color: #f5f5f5;
  padding: 8px;
  border-radius: 4px;
  max-height: 240px;
  overflow: auto;
}

.removed-fields-list,
.added-fields-list {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
</style>