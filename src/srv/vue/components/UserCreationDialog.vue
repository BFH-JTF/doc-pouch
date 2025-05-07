<template>
  <v-dialog v-model="dialogVisible" max-width="600px" persistent>
    <v-card>
      <v-card-title class="headline">Create New User</v-card-title>

      <v-card-text>
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

              <!-- Password fields -->
              <v-col cols="12">
                <v-text-field
                  v-model="newUser.password"
                  :rules="passwordRules"
                  label="Password"
                  type="password"
                  variant="outlined"
                  required
                  density="compact"
                ></v-text-field>
              </v-col>

              <v-col cols="12">
                <v-text-field
                  v-model="confirmPassword"
                  :rules="[...passwordRules, passwordMatchRule]"
                  label="Confirm Password"
                  type="password"
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
                  density="compact"
                ></v-text-field>
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
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="closeDialog">
          Cancel
        </v-btn>
        <v-btn 
          color="primary" 
          @click="submitForm" 
          :disabled="!formValid || newUser.password !== confirmPassword || isSubmitting"
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
import type DbPouchClient from '../DbPouchClient.ts';
import type { I_UserDisplay } from '../types.js';

// Props and emits
const props = defineProps<{
  show: boolean;
  apiClient: DbPouchClient;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  'user-created': [user: I_UserDisplay];
}>();

// Form state
const formValid = ref(false);
const errorMessage = ref('');
const isSubmitting = ref(false);
const confirmPassword = ref('');

// New user object
const newUser = reactive({
  name: '',
  password: '',
  email: '',
  isAdmin: false
});

// Form validation rules
const nameRules = [
  (v: string) => !!v || 'Username is required',
  (v: string) => v.length >= 3 || 'Username must be at least 3 characters',
  (v: string) => /^[a-zA-Z0-9_]+$/.test(v) || 'Username can only contain letters, numbers and underscores'
];

const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
  (v: string) => /[A-Z]/.test(v) || 'Password must contain at least one uppercase letter',
  (v: string) => /[0-9]/.test(v) || 'Password must contain at least one number'
];

const passwordMatchRule = (v: string) => v === newUser.password || 'Passwords do not match';

const emailRules = [
  (v: string) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || 'Email must be valid'
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
  if (!formValid.value || newUser.password !== confirmPassword.value) return;

  errorMessage.value = '';
  isSubmitting.value = true;

  try {
    const createdUser = await props.apiClient.createUser({
      name: newUser.name,
      password: newUser.password,
      email: newUser.email || undefined,
      isAdmin: newUser.isAdmin
    });

    emit('user-created', createdUser);
    closeDialog();
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
  newUser.password = '';
  newUser.email = '';
  newUser.isAdmin = false;
  confirmPassword.value = '';
  errorMessage.value = '';
  formValid.value = false;
}
</script>
