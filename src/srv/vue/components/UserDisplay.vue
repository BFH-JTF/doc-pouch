<template>
  <v-card class="user-display">
    <v-card-title>User Details</v-card-title>
    <v-card-text>
      <v-container>
        <v-row>
          <!-- ID field (read-only) -->
          <v-col cols="12">
            <v-text-field
              label="ID"
              :model-value="user?._id"
              readonly
              disabled
              variant="outlined"
              density="compact"
            ></v-text-field>
          </v-col>

          <!-- Username field -->
          <v-col cols="12">
            <v-text-field
              label="Username"
              v-model="username"
              variant="outlined"
              density="compact"
              @update:model-value="updateUsername"
            ></v-text-field>
          </v-col>

          <!-- Password field - now just shows a change password button -->
          <v-col cols="12">
            <v-btn 
              color="primary" 
              @click="showPasswordDialog = true"
              variant="outlined"
              block
            >
              Change Password
            </v-btn>
          </v-col>

          <!-- Email field -->
          <v-col cols="12">
            <v-text-field
              label="Email"
              v-model="email"
              variant="outlined"
              density="compact"
              @update:model-value="updateEmail"
            ></v-text-field>
          </v-col>

          <!-- isAdmin field -->
          <v-col cols="12">
            <div class="d-flex align-center">
              <v-switch
                label="Administrator"
                v-model="isAdmin"
                color="primary"
                @update:model-value="updateIsAdmin"
              ></v-switch>
              <v-tooltip location="top">
                <template v-slot:activator="{ props }">
                  <v-icon v-bind="props" icon="mdi-information-outline" size="small" class="ml-2"></v-icon>
                </template>
                Administrators can manage all users, documents and data structures. Regular users can only manage their own documents.
              </v-tooltip>
            </div>
          </v-col>
        </v-row>
      </v-container>
    </v-card-text>

    <!-- Password Change Dialog -->
    <v-dialog v-model="showPasswordDialog" max-width="500px">
      <v-card>
        <v-card-title>Change Password</v-card-title>
        <v-card-text>
          <v-alert
            type="info"
            variant="tonal"
            density="compact"
            class="mb-3"
          >
            Password must contain at least 8 characters, one uppercase letter, and one number.
          </v-alert>
          <v-form ref="passwordForm" @submit.prevent="submitPasswordChange" v-model="validForm">
            <v-text-field
              v-model="newPassword"
              :rules="passwordRules"
              label="New Password"
              type="password"
              required
              variant="outlined"
            ></v-text-field>
            <v-text-field
              v-model="confirmPassword"
              :rules="[...passwordRules, passwordMatchRule]"
              label="Confirm Password"
              type="password"
              required
              variant="outlined"
            ></v-text-field>
            <div class="d-flex justify-end mt-4">
              <v-btn color="error" class="mr-2" @click="cancelPasswordChange">Cancel</v-btn>
              <v-btn color="primary" type="submit" :disabled="!validForm || newPassword !== confirmPassword">Save</v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import type { I_UserEntry } from '../types.js';

const props = defineProps<{
  user: I_UserEntry | undefined;
}>();

const emit = defineEmits<{
  'user-updated': [userID: string, field: string, value: any];
}>();

// Create local refs for the editable fields
const username = ref(props.user?.name);
const password = ref(props.user?.password);
const email = ref(props.user?.email);
const isAdmin = ref(props.user?.isAdmin);

// Password change dialog
const showPasswordDialog = ref(false);
const newPassword = ref('');
const confirmPassword = ref('');
const validForm = ref(false);

// Password validation rules
const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
  (v: string) => /[A-Z]/.test(v) || 'Password must contain at least one uppercase letter',
  (v: string) => /[0-9]/.test(v) || 'Password must contain at least one number',
];

const passwordMatchRule = (v: string) => v === newPassword.value || 'Passwords do not match';

onMounted(() => {
  console.log("UserDisplay mounted, user:", props.user);
});

// Watch for changes in the user prop
watch(() => props.user, (newUser) => {
  console.log("User prop changed:", newUser);
  if (!newUser) return;

  username.value = newUser.name;
  password.value = newUser.password;
  email.value = newUser.email;
  isAdmin.value = newUser.isAdmin;
}, { immediate: true, deep: true });

// Emit events when fields change
function updateUsername(value: string) {
  console.log('updateUsername called with value:', value);
  if (props.user?._id !== undefined) {
    console.log('Emitting user-updated for username:', props.user._id, 'name', value);
    emit('user-updated', props.user._id, 'name', value);
  } else {
    console.error('Cannot update username: user id is undefined', props.user);
  }
}

function updateEmail(value: string | undefined) {
  console.log('updateEmail called with value:', value);
  if (props.user?._id !== undefined) {
    console.log('Emitting user-updated for email:', props.user._id, 'email', value);
    emit('user-updated', props.user._id, 'email', value);
  } else {
    console.error('Cannot update email: user id is undefined', props.user);
  }
}

function updateIsAdmin(value: boolean | null) {
  console.log('updateIsAdmin called with value:', value);
  if (props.user?._id !== undefined) {
    console.log('Emitting user-updated for isAdmin:', props.user._id, 'isAdmin', value);
    emit('user-updated', props.user._id, 'isAdmin', value);
  } else {
    console.error('Cannot update isAdmin: user id is undefined', props.user);
  }
}

// Password change functions
function submitPasswordChange() {
  if (newPassword.value === confirmPassword.value && props.user?._id !== undefined) {
    console.log('Emitting user-updated for password:', props.user._id, 'password', newPassword.value);
    emit('user-updated', props.user._id, 'password', newPassword.value);
    closePasswordDialog();
  }
}

function cancelPasswordChange() {
  closePasswordDialog();
}

function closePasswordDialog() {
  showPasswordDialog.value = false;
  newPassword.value = '';
  confirmPassword.value = '';
}
</script>

<style scoped>
.user-display {
  width: 100%;
}
</style>