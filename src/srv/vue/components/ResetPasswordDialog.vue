<script setup lang="ts">
import {ref} from 'vue';

const props = defineProps<{
  show: boolean;
  token: string;
}>();

const emit = defineEmits<{
  'close': [];
  'reset-success': [];
}>();

const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

async function handleReset() {
  errorMessage.value = '';
  successMessage.value = '';

  if (!newPassword.value || !confirmPassword.value) {
    errorMessage.value = 'Please enter and confirm the new password';
    return;
  }
  if (newPassword.value.length < 8) {
    errorMessage.value = 'The password must be at least 8 characters long';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = 'The passwords do not match';
    return;
  }

  loading.value = true;

  try {
    const response = await fetch('/users/reset-password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: props.token, password: newPassword.value}),
    });

    if (response.ok) {
      successMessage.value = 'Password reset successful. You can now log in with your new password.';
      newPassword.value = '';
      confirmPassword.value = '';
      // Give the user a moment to read the confirmation, then return
      // to the login view.
      setTimeout(() => {
        emit('reset-success');
        emit('close');
      }, 2500);
    } else {
      const data = await response.json().catch(() => null);
      errorMessage.value = data?.error || 'The reset link is invalid or has expired. Please request a new one.';
    }
  } catch {
    errorMessage.value = 'An error occurred. Please try again.';
  } finally {
    loading.value = false;
  }
}

function handleCancel() {
  emit('close');
}
</script>

<template>
  <v-dialog :model-value="props.show" max-width="420px" persistent>
    <v-card>
      <v-card-title class="text-h5">Set a New Password</v-card-title>
      <v-card-text>
        <v-container>
          <v-row>
            <v-col cols="12">
              <v-text-field
                  v-model="newPassword"
                  autocomplete="new-password"
                  label="New password"
                  required
                  type="password"
                  @keyup.enter="handleReset"
              ></v-text-field>
            </v-col>
            <v-col cols="12">
              <v-text-field
                  v-model="confirmPassword"
                  autocomplete="new-password"
                  label="Confirm new password"
                  required
                  type="password"
                  @keyup.enter="handleReset"
              ></v-text-field>
            </v-col>
          </v-row>
          <v-alert
              v-if="successMessage"
              class="mt-2"
              density="compact"
              type="success"
          >
            {{ successMessage }}
          </v-alert>
          <v-alert
              v-if="errorMessage"
              class="mt-2"
              density="compact"
              type="error"
          >
            {{ errorMessage }}
          </v-alert>
        </v-container>
      </v-card-text>
      <v-card-actions class="justify-center pb-4">
        <v-btn variant="text" @click="handleCancel">Cancel</v-btn>
        <v-btn
            :disabled="!!successMessage"
            :loading="loading"
            color="primary"
            variant="elevated"
            @click="handleReset"
        >
          Reset Password
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>