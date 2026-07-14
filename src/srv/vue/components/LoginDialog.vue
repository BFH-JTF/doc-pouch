<script setup lang="ts">
import { ref } from 'vue';
import DbPouchClient from "docpouch-client";
import oidcBanner from '../assets/oidc-banner.jpg';
import type {I_LoginResponse} from "docpouch-client";

const props = defineProps<{
  show: boolean;
  apiClient: DbPouchClient;
  showOidc?: boolean;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
  'login-success': [loginInformation: I_LoginResponse];
  'oidc-login': [];
}>();

const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');
const showForgotPassword = ref(false);
const forgotEmail = ref('');
const forgotLoading = ref(false);
const forgotMessage = ref('');
const forgotError = ref('');

async function handleLogin() {
  if (!username.value || !password.value) {
    errorMessage.value = 'Please enter both username and password';
    return;
  }

  loading.value = true;
  errorMessage.value = '';

  try {
    let loginInfo = await props.apiClient.login({
      name: username.value,
      password: password.value
    });

    if (loginInfo && loginInfo.token !== null) {
      emit('login-success', loginInfo);
      emit('update:show', false);
      username.value = '';
      password.value = '';
    } else {
      errorMessage.value = 'Login failed. Please check your credentials.';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorMessage.value = 'An error occurred during login.';
  } finally {
    loading.value = false;
  }
}

async function handleForgotPassword() {
  if (!forgotEmail.value) {
    forgotError.value = 'Please enter your email address';
    return;
  }

  forgotLoading.value = true;
  forgotError.value = '';
  forgotMessage.value = '';

  try {
    const response = await fetch('/users/forgot-password', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email: forgotEmail.value}),
    });

    if (response.ok) {
      const data = await response.json();
      forgotMessage.value = data.message || 'If an account with that email exists, a reset link has been sent.';
    } else {
      forgotError.value = 'Failed to request password reset. Please try again.';
    }
  } catch {
    forgotError.value = 'An error occurred. Please try again.';
  } finally {
    forgotLoading.value = false;
  }
}

function backToLogin() {
  showForgotPassword.value = false;
  forgotMessage.value = '';
  forgotError.value = '';
}
</script>

<template>
  <v-dialog v-model="props.show" persistent max-width="400px" @input="$emit('update:show', $event)">
    <v-card>
      <template v-if="!showForgotPassword">
        <v-card-title class="text-h5">Login Required</v-card-title>
        <v-card-text>
          <v-container>
            <v-row>
              <v-col cols="12">
                <v-text-field
                    v-model="username"
                    label="Username"
                    required
                    @keyup.enter="handleLogin"
                ></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-text-field
                    v-model="password"
                    label="Password"
                    required
                    type="password"
                    @keyup.enter="handleLogin"
                ></v-text-field>
              </v-col>
            </v-row>
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
        <v-card-actions class="justify-center">
          <v-btn
              :loading="loading"
              color="primary"
              variant="elevated"
              @click="handleLogin"
          >
            Login
          </v-btn>
        </v-card-actions>
        <v-card-actions class="justify-center pa-0 pb-4">
          <v-btn color="primary" size="small" variant="text" @click="showForgotPassword = true">
            Forgot password?
          </v-btn>
        </v-card-actions>
        <v-divider v-if="props.showOidc" class="mx-4 my-2"></v-divider>
        <v-img
            v-if="props.showOidc"
            :src="oidcBanner"
            class="mx-4 my-2 rounded cursor-pointer"
            style="cursor: pointer;"
            @click="emit('oidc-login')"
        ></v-img>
      </template>

      <template v-else>
        <v-card-title class="text-h5">Reset Password</v-card-title>
        <v-card-text>
          <v-container>
            <v-row>
              <v-col cols="12">
                <p class="text-body-2 mb-4">Enter your email address and we'll send you a link to reset your
                  password.</p>
                <v-text-field
                    v-model="forgotEmail"
                    label="Email address"
                    required
                    type="email"
                    @keyup.enter="handleForgotPassword"
                ></v-text-field>
              </v-col>
            </v-row>
            <v-alert
                v-if="forgotMessage"
                class="mt-2"
                density="compact"
                type="success"
            >
              {{ forgotMessage }}
            </v-alert>
            <v-alert
                v-if="forgotError"
                class="mt-2"
                density="compact"
                type="error"
            >
              {{ forgotError }}
            </v-alert>
          </v-container>
        </v-card-text>
        <v-card-actions class="justify-center">
          <v-btn variant="text" @click="backToLogin">Back to Login</v-btn>
          <v-btn
              :disabled="!!forgotMessage"
              :loading="forgotLoading"
              color="primary"
              variant="elevated"
              @click="handleForgotPassword"
          >
            Send Reset Link
          </v-btn>
        </v-card-actions>
      </template>
    </v-card>
  </v-dialog>
</template>