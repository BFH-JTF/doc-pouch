<template>
  <v-dialog v-model="dialogVisible" max-width="600px" persistent>
    <v-card>
      <v-card-title class="headline bg-blue-darken-2">Create New User</v-card-title>

      <v-card-text>
        <v-alert class="mb-4" density="compact" type="info" variant="tonal">
          A random password will be generated and sent to the user's email address.
        </v-alert>

        <v-form ref="form" v-model="formValid" @submit.prevent="submitForm">
          <v-container>
            <v-row>
              <!-- Username field -->
              <v-col cols="12">
                <v-text-field
                  v-model="newUser.name"
                  :rules="nameRules"
                  label="Username"
                  variant="outlined"
                  required
                  density="compact"
                ></v-text-field>
              </v-col>

              <!-- Email field -->
              <v-col cols="12">
                <v-text-field
                  v-model="newUser.email"
                  :rules="emailRules"
                  label="Email"
                  variant="outlined"
                  required
                  density="compact"
                ></v-text-field>
              </v-col>

              <!-- Department field -->
              <v-col cols="12">
                <v-combobox
                    v-model="newUser.department"
                    :rules="mandatoryFieldRules"
                    label="Department"
                    :items="props.departmentList"
                    variant="outlined"
                    density="compact"
                ></v-combobox>

              </v-col>

              <!-- Group field -->
              <v-col cols="12">
                <v-combobox
                    v-model="newUser.group"
                    :rules="mandatoryFieldRules"
                    label="Group"
                    :items="props.groupList"
                    variant="outlined"
                    density="compact"
                ></v-combobox>
              </v-col>

              <!-- Admin switch -->
              <v-col cols="12">
                <v-switch
                  v-model="newUser.isAdmin"
                  color="primary"
                  label="Administrator"
                ></v-switch>
              </v-col>
            </v-row>
          </v-container>
        </v-form>

        <!-- Error alert -->
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mt-4"
        >
          {{ errorMessage }}
        </v-alert>

        <!-- Success alert showing password when email fails -->
        <v-alert
            v-if="successMessage"
            class="mt-4"
            type="success"
            variant="tonal"
        >
          {{ successMessage }}
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="closeDialog">
          Cancel
        </v-btn>
        <v-btn 
          color="primary" 
          :disabled="!formValid || isSubmitting"
          @click="submitForm"
          :loading="isSubmitting"
        >
          Create User
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
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
  'user-created': [user: I_UserDisplay];
}>();

// Form state
const formValid = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const isSubmitting = ref(false);

// New user object (no password field - auto-generated)
const newUser = reactive({
  name: '',
  email: '',
  department: '',
  group: '',
  isAdmin: false
});

// Form validation rules
const nameRules = [
  (v: string) => !!v || 'Username is required',
  (v: string) => v.length >= 3 || 'Username must be at least 3 characters',
  (v: string) => /^[a-zA-Z0-9_]+$/.test(v) || 'Username can only contain letters, numbers and underscores'
];

const mandatoryFieldRules = [
  (v: string) => !!v || 'This field is required',
];

const emailRules = [
  (v: string) => !!v || 'Email is required',
  (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Email must be valid'
];

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

// Form submission
async function submitForm() {
  if (!formValid.value) return;

  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const createdUser = await props.apiClient.createUser({
      name: newUser.name,
      email: newUser.email,
      isAdmin: newUser.isAdmin,
      department: newUser.department,
      group: newUser.group
    } as I_UserCreation);

    if ((createdUser as any).password) {
      successMessage.value = `User created. Generated password: ${(createdUser as any).password}`;
    } else if ((createdUser as any).message) {
      successMessage.value = (createdUser as any).message;
    }

    emit('user-created', createdUser);

    if (!successMessage.value) {
      closeDialog();
    }
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to create user';
    console.error('Error creating user:', error);
  } finally {
    isSubmitting.value = false;
  }
}

function closeDialog() {
  dialogVisible.value = false;
}

function resetForm() {
  // Reset form data
  newUser.name = '';
  newUser.email = '';
  newUser.isAdmin = false;
  errorMessage.value = '';
  successMessage.value = '';
  formValid.value = false;
}
</script>