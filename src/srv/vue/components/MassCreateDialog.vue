<template>
  <v-dialog v-model="dialogVisible" max-width="800px" persistent>
    <v-card>
      <v-card-title class="headline bg-blue-darken-2">Mass Create Users</v-card-title>

      <v-card-text>
        <v-form ref="form" v-model="formValid" @submit.prevent="submitForm">
          <v-container>
            <v-row>
              <!-- CSV file upload -->
              <v-col cols="12">
                <v-file-input
                    v-model="csvFile"
                    :rules="fileRules"
                    accept=".csv"
                    density="compact"
                    label="Upload CSV File"
                    variant="outlined"
                    @update:model-value="handleFileUpload"
                ></v-file-input>
              </v-col>

              <v-col cols="12">
                <v-checkbox
                    v-model="ignoreFirstRow"
                    class="mb-2"
                    density="compact"
                    hide-details="auto"
                    label="First row is header"
                    variant="outlined"
                />

              </v-col>

              <!-- CSV preview and column mapping -->
              <v-col v-if="csvData.length > 0" cols="12">
                <v-card class="mb-4" variant="outlined">
                  <v-card-title class="text-subtitle-1">
                    CSV Data Preview and Column Mapping
                  </v-card-title>
                  <v-card-text>
                    <div class="d-flex mb-4">
                      <v-select
                          v-model="columnMapping.name"
                          :items="columnOptions"
                          :rules="mandatoryFieldRules"
                          class="mr-2"
                          density="compact"
                          label="Username Column"
                          variant="outlined"
                      ></v-select>
                      <v-select
                          v-model="columnMapping.email"
                          :items="columnOptions"
                          :rules="mandatoryFieldRules"
                          class="mr-2"
                          density="compact"
                          label="Email Column"
                          variant="outlined"
                      ></v-select>
                      <v-select
                          v-model="columnMapping.department"
                          :items="columnOptions"
                          :rules="mandatoryFieldRules"
                          class="mr-2"
                          density="compact"
                          label="Department Column"
                          variant="outlined"
                      ></v-select>
                      <v-select
                          v-model="columnMapping.group"
                          :items="columnOptions"
                          :rules="mandatoryFieldRules"
                          density="compact"
                          label="Group Column"
                          variant="outlined"
                      ></v-select>
                    </div>

                    <!-- CSV data preview table -->
                    <v-table class="csv-preview" density="compact">
                      <thead>
                      <tr>
                        <th v-for="(header, index) in csvHeaders" :key="index">
                          {{ header }}
                        </th>
                      </tr>
                      </thead>
                      <tbody>
                      <tr v-for="(row, rowIndex) in csvPreviewRows" :key="rowIndex">
                        <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                          {{ cell }}
                        </td>
                      </tr>
                      </tbody>
                    </v-table>

                    <div class="text-caption mt-2">
                      Showing {{ Math.min(5, csvData.length - (ignoreFirstRow ? 1 : 0)) }} of
                      {{ csvData.length - (ignoreFirstRow ? 1 : 0) }} rows
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>

              <!-- Password field for all users -->
              <v-col cols="12">
                <v-text-field
                    v-model="commonPassword"
                    :rules="passwordRules"
                    density="compact"
                    label="Password for all users"
                    required
                    type="password"
                    variant="outlined"
                ></v-text-field>
              </v-col>

              <v-col cols="12">
                <v-text-field
                    v-model="confirmPassword"
                    :rules="[...passwordRules, passwordMatchRule]"
                    density="compact"
                    label="Confirm Password"
                    required
                    type="password"
                    variant="outlined"
                ></v-text-field>
              </v-col>
            </v-row>
          </v-container>
        </v-form>

        <!-- Error alert -->
        <v-alert
            v-if="errorMessage"
            class="mt-4"
            type="error"
            variant="tonal"
        >
          {{ errorMessage }}
        </v-alert>

        <!-- Success summary -->
        <v-alert
            v-if="successSummary"
            class="mt-4"
            type="success"
            variant="tonal"
        >
          {{ successSummary }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="closeDialog">
          Cancel
        </v-btn>
        <v-btn
            :disabled="!formValid || !csvFile || commonPassword !== confirmPassword || isSubmitting || !isColumnMappingValid"
            :loading="isSubmitting"
            color="primary"
            @click="submitForm"
        >
          Create Users
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {ref, reactive, watch, computed} from 'vue';
import type DbPouchClient from 'docpouch-client';
import type {I_UserCreation, I_UserDisplay} from 'docpouch-client';

// Props and emits
const props = defineProps<{
  show: boolean;
  apiClient: DbPouchClient;
  groupList: string[];
  departmentList: string[];
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  'users-created': [users: I_UserDisplay[]];
}>();

// Form state
const form = ref<any>(null);
const formValid = ref(false);
const errorMessage = ref('');
const successSummary = ref('');
const isSubmitting = ref(false);
const csvFile = ref<File | null>(null);
const csvData = ref<string[][]>([]);
const commonPassword = ref('');
const confirmPassword = ref('');
const ignoreFirstRow = ref(true);

// Column mapping
const columnMapping = reactive({
  name: '',
  email: '',
  department: '',
  group: ''
});

// Computed properties
const columnOptions = computed(() => {
  // If first row is header, use the first row's values as column names
  if (ignoreFirstRow.value && csvData.value.length > 0) {
    return csvData.value[0].map((header, index) => ({
      title: header,
      value: index.toString()
    }));
  }

  // If first row is not a header, generate generic column names
  return csvData.value[0].map((_, index) => ({
    title: `Column ${index + 1}`,
    value: index.toString()
  }));
});

const csvPreviewRows = computed(() => {
  // If first row is header, slice from index 1, otherwise from index 0
  // Always show up to 5 rows
  const startIndex = ignoreFirstRow.value ? 1 : 0;
  return csvData.value.slice(startIndex, startIndex + 5);
});

const csvHeaders = computed(() => {
  // If first row is header, use the first row, otherwise generate generic headers
  if (ignoreFirstRow.value && csvData.value.length > 0) {
    return csvData.value[0];
  }
  // Generate generic column headers if no header or all rows are used
  return csvData.value[0].map((_, index) => `Column ${index + 1}`);
});

const isColumnMappingValid = computed(() => {
  return columnMapping.name !== '' &&
      columnMapping.email !== '' &&
      columnMapping.department !== '' &&
      columnMapping.group !== '';
});

// Form validation rules
const fileRules = [
  (v: any) => !!v || 'CSV file is required',
  (v: any) => !v || v.type === 'text/csv' || v[0]?.type === 'text/csv' || 'File must be a CSV'
];

const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
  (v: string) => /[A-Z]/.test(v) || 'Password must contain at least one uppercase letter',
  (v: string) => /[0-9]/.test(v) || 'Password must contain at least one number'
];

const mandatoryFieldRules = [
  (v: string) => !!v || 'This field is required',
];

const passwordMatchRule = (v: string) => v === commonPassword.value || 'Passwords do not match';

// Sync dialog visibility with prop
const dialogVisible = ref(props.show);

watch(() => props.show, (newValue) => {
  dialogVisible.value = newValue;
});

watch(dialogVisible, (newValue) => {
  emit('update:show', newValue);
  if (!newValue) {
    resetForm();
  }
});

// CSV file handling
async function handleFileUpload() {
  if (!csvFile.value) {
    csvData.value = [];
    return;
  }

  try {
    const text = await csvFile.value.text();
    const rows = parseCSV(text);

    if (rows.length > 0) {
      csvData.value = rows;

      // Reset column mapping
      columnMapping.name = '';
      columnMapping.email = '';
      columnMapping.department = '';
      columnMapping.group = '';
    } else {
      errorMessage.value = 'CSV file is empty or invalid';
      csvData.value = [];
    }
  } catch (error: any) {
    errorMessage.value = `Error parsing CSV file: ${error.message}`;
    csvData.value = [];
  }
}

function parseCSV(text: string): string[][] {
  // Simple CSV parser that handles quoted values
  const rows: string[][] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (line.trim() === '') continue;

    const row: string[] = [];
    let inQuotes = false;
    let currentValue = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add the last value
    row.push(currentValue.trim());
    rows.push(row);
  }

  return rows;
}

// Form submission
async function submitForm() {
  if (!formValid.value || !csvFile.value || commonPassword.value !== confirmPassword.value || !isColumnMappingValid.value) return;

  errorMessage.value = '';
  successSummary.value = '';
  isSubmitting.value = true;

  try {
    const nameIndex = parseInt(columnMapping.name);
    const emailIndex = columnMapping.email ? parseInt(columnMapping.email) : -1;
    const departmentIndex = parseInt(columnMapping.department);
    const groupIndex = parseInt(columnMapping.group);

    // Skip header row
    const dataRows = csvData.value.slice(ignoreFirstRow.value ? 1 : 0);
    const createdUsers: I_UserDisplay[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const row of dataRows) {
      if (row.length <= Math.max(nameIndex, emailIndex, departmentIndex, groupIndex)) {
        // Skip rows that don't have enough columns
        failureCount++;
        continue;
      }

      try {
        const userData: I_UserCreation = {
          name: row[nameIndex].trim(),
          password: commonPassword.value,
          email: row[emailIndex]?.trim() || '',
          department: row[departmentIndex].trim(),
          group: row[groupIndex].trim(),
          isAdmin: false // Mass created users are always non-admin
        };

        const createdUser = await props.apiClient.createUser(userData);
        createdUsers.push(createdUser);
        successCount++;
      } catch (error) {
        failureCount++;
      }
    }

    if (successCount > 0) {
      successSummary.value = `Successfully created ${successCount} users.`;
      if (failureCount > 0) {
        successSummary.value += ` Failed to create ${failureCount} users.`;
      }
      emit('users-created', createdUsers);
    } else {
      errorMessage.value = `Failed to create any users. Please check your CSV data and try again.`;
    }

    if (successCount > 0 && failureCount === 0) {
      // Close dialog only if all users were created successfully
      closeDialog();
    }
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to create users';
    console.error('Error creating users:', error);
  } finally {
    isSubmitting.value = false;
  }
}

function closeDialog() {
  dialogVisible.value = false;
}

function resetForm() {
  // Reset form data
  if (form.value) {
    form.value.reset();
  }
  csvFile.value = null;
  csvData.value = [];
  commonPassword.value = '';
  confirmPassword.value = '';
  errorMessage.value = '';
  successSummary.value = '';
  formValid.value = false;

  // Reset column mapping
  columnMapping.name = '';
  columnMapping.email = '';
  columnMapping.department = '';
  columnMapping.group = '';
}
</script>

<style scoped>
.csv-preview {
  max-height: 300px;
  overflow-y: auto;
}
</style>