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
</script>

<template>
  <v-dialog v-model="props.show" persistent max-width="400px" @input="$emit('update:show', $event)">
    <v-card>
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
                type="password"
                required
                @keyup.enter="handleLogin"
              ></v-text-field>
            </v-col>
          </v-row>
          <v-alert
            v-if="errorMessage"
            type="error"
            density="compact"
            class="mt-2"
          >
            {{ errorMessage }}
          </v-alert>
        </v-container>
      </v-card-text>
      <v-card-actions class="justify-center">
        <v-btn
          color="primary"
          variant="elevated"
          :loading="loading"
          @click="handleLogin"
        >
          Login
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
    </v-card>
  </v-dialog>
</template>