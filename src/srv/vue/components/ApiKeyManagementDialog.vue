<template>
  <v-dialog v-model="dialogVisible" max-width="700px" persistent>
    <v-card>
      <v-card-title class="headline bg-blue-darken-2 d-flex align-center">
        <v-icon start>mdi-key</v-icon>
        API Key Management
        <v-spacer></v-spacer>
        <v-btn icon variant="text" @click="closeDialog">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <v-alert v-if="errorMessage" class="mb-4" type="error" variant="tonal">
          {{ errorMessage }}
        </v-alert>

        <v-alert v-if="successMessage" class="mb-4" type="success" variant="tonal">
          {{ successMessage }}
        </v-alert>

        <v-form ref="form" v-model="formValid" @submit.prevent="createKey">
          <v-row align="center">
            <v-col cols="12" sm="6">
              <v-text-field
                  v-model="newKeyName"
                  :rules="nameRules"
                  density="compact"
                  hint="A descriptive name to identify this key"
                  label="Key Name"
                  persistent-hint
                  placeholder="e.g., Home Assistant, MCP Client"
                  variant="outlined"
              ></v-text-field>
            </v-col>
            <v-col cols="12" sm="4">
              <v-select
                  v-model="expirySelection"
                  :items="expiryOptions"
                  density="compact"
                  label="Expiry"
                  variant="outlined"
              ></v-select>
            </v-col>
            <v-col cols="12" sm="2">
              <v-btn
                  :disabled="!formValid || newKeyName.trim().length === 0"
                  :loading="isCreating"
                  block
                  color="primary"
                  type="submit"
              >
                Create
              </v-btn>
            </v-col>
          </v-row>
        </v-form>

        <div v-if="createdKey" class="mt-4">
          <v-alert type="warning" variant="tonal">
            <strong>Copy this key now!</strong> You will not be able to see it again.
            <v-text-field
                v-model="createdKey"
                append-inner-icon="mdi-content-copy"
                class="mt-2"
                density="compact"
                readonly
                variant="outlined"
                @click:append-inner="copyKey"
            ></v-text-field>
          </v-alert>
        </div>

        <v-divider class="my-4"></v-divider>

        <div class="text-subtitle-1 mb-2">Your API Keys ({{ keys.length }}/10)</div>

        <v-list v-if="keys.length > 0" class="border rounded" density="compact">
          <v-list-item v-for="key in keys" :key="key._id" class="mb-1">
            <template v-slot:prepend>
              <v-icon color="primary">mdi-key-variant</v-icon>
            </template>
            <v-list-item-title>{{ key.name }}</v-list-item-title>
            <v-list-item-subtitle>
              <span class="mr-3">
                <v-icon class="mr-1" size="small">mdi-key</v-icon>
                {{ key.keyPrefix }}********
              </span>
              <span class="mr-3">
                <v-icon class="mr-1" size="small">mdi-clock-outline</v-icon>
                Created {{ formatDate(key.createdAt) }}
              </span>
              <span v-if="key.lastUsedAt" class="mr-3">
                <v-icon class="mr-1" size="small">mdi-clock-check-outline</v-icon>
                Last used {{ formatDate(key.lastUsedAt) }}
              </span>
              <span v-if="key.expiresAt">
                <v-icon class="mr-1" size="small">mdi-calendar-clock</v-icon>
                Expires {{ formatDate(key.expiresAt) }}
              </span>
              <span v-else>
                <v-chip color="success" size="x-small" variant="flat">Never expires</v-chip>
              </span>
            </v-list-item-subtitle>
            <template v-slot:append>
              <v-btn
                  color="error"
                  icon="mdi-delete"
                  size="small"
                  variant="text"
                  @click="deleteKey(key._id)"
              ></v-btn>
            </template>
          </v-list-item>
        </v-list>

        <v-alert v-else class="mt-2" type="info" variant="tonal">
          No API keys yet. Create one to use with MCP clients.
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="primary" @click="closeDialog">Done</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import {ref, watch, onMounted} from 'vue';
import type DbPouchClient from 'docpouch-client';

interface I_ApiKeyListItem {
  _id: string;
  name: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

interface I_ApiKeyCreated {
  key: string;
  keyPrefix: string;
  name: string;
  createdAt: number;
  expiresAt?: number;
}

const props = defineProps<{
  show: boolean;
  apiClient: DbPouchClient;
}>();

const emit = defineEmits<{
  'update:show': [value: boolean];
}>();

const dialogVisible = ref(props.show);
const keys = ref<I_ApiKeyListItem[]>([]);
const newKeyName = ref('');
const expirySelection = ref('never');
const createdKey = ref<string | null>(null);
const errorMessage = ref('');
const successMessage = ref('');
const isCreating = ref(false);
const formValid = ref(false);

const expiryOptions = [
  {title: 'Never expires', value: 'never'},
  {title: '30 days', value: '30'},
  {title: '90 days', value: '90'},
  {title: '180 days', value: '180'},
  {title: '365 days', value: '365'},
];

const nameRules = [
  (v: string) => !!v || 'Name is required',
  (v: string) => v.length >= 2 || 'Name must be at least 2 characters',
  (v: string) => v.length <= 50 || 'Name must be less than 50 characters',
];

watch(() => props.show, (newValue) => {
  dialogVisible.value = newValue;
  if (newValue) {
    loadKeys();
    createdKey.value = null;
    errorMessage.value = '';
    successMessage.value = '';
    newKeyName.value = '';
    expirySelection.value = 'never';
  }
});

watch(dialogVisible, (newValue) => {
  emit('update:show', newValue);
});

async function loadKeys() {
  try {
    const response = await fetch('/api-keys/list', {
      headers: {
        'Authorization': `Bearer ${props.apiClient.getStoredToken()}`
      }
    });
    if (response.ok) {
      keys.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load API keys:', error);
    errorMessage.value = 'Failed to load API keys';
  }
}

async function createKey() {
  if (!formValid.value || newKeyName.value.trim().length === 0) return;

  errorMessage.value = '';
  successMessage.value = '';
  isCreating.value = true;

  try {
    const expiresInDays = expirySelection.value === 'never' ? undefined : parseInt(expirySelection.value);

    const response = await fetch('/api-keys/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${props.apiClient.getStoredToken()}`
      },
      body: JSON.stringify({
        name: newKeyName.value.trim(),
        expiresInDays
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create API key');
    }

    const result: I_ApiKeyCreated = await response.json();
    createdKey.value = result.key;
    successMessage.value = 'API key created! Copy it now - you will not see it again.';
    newKeyName.value = '';
    await loadKeys();
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to create API key';
    console.error('Error creating API key:', error);
  } finally {
    isCreating.value = false;
  }
}

async function deleteKey(keyId: string) {
  if (!confirm('Are you sure you want to delete this API key?')) return;

  errorMessage.value = '';
  try {
    const response = await fetch(`/api-keys/${keyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${props.apiClient.getStoredToken()}`
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete API key');
    }

    successMessage.value = 'API key deleted';
    await loadKeys();
    setTimeout(() => {
      successMessage.value = '';
    }, 3000);
  } catch (error: any) {
    errorMessage.value = error.message || 'Failed to delete API key';
    console.error('Error deleting API key:', error);
  }
}

function copyKey() {
  if (createdKey.value) {
    navigator.clipboard.writeText(createdKey.value);
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function closeDialog() {
  dialogVisible.value = false;
}
</script>
