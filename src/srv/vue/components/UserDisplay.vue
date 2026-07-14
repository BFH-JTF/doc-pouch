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

          <!-- Reset Password button (admin only) -->
          <v-col v-if="props.isAdmin" cols="12">
            <v-btn
                :loading="resetLoading"
                color="warning"
              variant="outlined"
              block
                @click="handleResetPassword"
            >
              Reset Password
            </v-btn>
            <div v-if="resetResult" class="mt-2 text-caption">
              <v-alert v-if="resetResult.password" density="compact" type="warning" variant="tonal">
                New password: {{ resetResult.password }}
              </v-alert>
              <v-alert v-else-if="resetResult.message && !resetResult.password"
                       :type="resetResult.isError ? 'error' : 'success'" density="compact" variant="tonal">
                {{ resetResult.message }}
              </v-alert>
            </div>
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

          <!-- Department field -->
          <v-col cols="12">
            <v-combobox label="Department"
                        :items="props.departmentList"
                        variant="outlined"
                        density="compact"
                        v-model="department"
                        @update:model-value="updateDepartment"/>
          </v-col>

          <!-- Group field -->
          <v-col cols="12">
            <v-combobox label="Group"
                        :items="props.groupList"
                        variant="outlined"
                        density="compact"
                        v-model="group"
                        @update:model-value="updateGroup"/>
          </v-col>

          <!-- isAdmin field -->
          <v-col cols="12">
            <div class="d-flex align-center">
              <v-switch
                label="Administrator"
                v-model="userIsAdmin"
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
  </v-card>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import type {I_UserEntry} from 'docpouch-client';
import type DbPouchClient from 'docpouch-client';

const props = defineProps<{
  user: I_UserEntry | undefined;
  departmentList: string[];
  groupList: string[];
  isAdmin?: boolean;
  apiClient: DbPouchClient;
}>();

const emit = defineEmits<{
  'user-updated': [userID: string, field: string, value: any];
}>();

const username = ref(props.user?.name);
const email = ref(props.user?.email);
const userIsAdmin = ref(props.user?.isAdmin);
const department = ref(props.user?.department);
const group = ref(props.user?.group);

const resetLoading = ref(false);
const resetResult = ref<{ password?: string; message?: string; isError?: boolean } | null>(null);

let departmentItems = computed(() => {
  return props.departmentList.map(d => {
    return { text: d, value: d };
  })
});

let groupItems = computed(() => {
    return props.groupList.map(d => {
      return { text: d, value: d };
    });
})

onMounted(() => {
  console.log("UserDisplay mounted, user:", props.user?._id);
});

// Watch for changes in the user prop
watch(() => props.user, (newUser) => {
  console.log("User prop changed:", newUser?._id);
  if (!newUser) return;

  username.value = newUser.name;
  email.value = newUser.email;
  userIsAdmin.value = newUser.isAdmin;
  department.value = newUser.department;
  group.value = newUser.group;
  resetResult.value = null;
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

function updateDepartment(value: string | undefined) {
  console.log('updateDepartment called with value:', value);
  if (props.user?._id !== undefined) {
    console.log('Emitting user-updated for department:', props.user._id, 'department', value);
    emit('user-updated', props.user._id, 'department', value);
  } else {
    console.error('Cannot update department: user id is undefined', props.user);
  }
}

function updateGroup(value: string | undefined) {
  console.log('updateGroup called with value:', value);
  if (props.user?._id !== undefined) {
    console.log('Emitting user-updated for group:', props.user._id, 'group', value);
    emit('user-updated', props.user._id, 'group', value);
  } else {
    console.error('Cannot update group: user id is undefined', props.user);
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

async function handleResetPassword() {
  if (!props.user?._id) return;
  resetLoading.value = true;
  resetResult.value = null;

  try {
    const token = props.apiClient.getToken();
    if (!token) {
      resetResult.value = {message: 'Not authenticated', isError: true};
      resetLoading.value = false;
      return;
    }
    const response = await fetch(`/users/admin-reset-password/${props.user._id}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = await response.json();
    if (response.ok) {
      resetResult.value = data;
    } else {
      resetResult.value = {message: data.error || 'Failed to reset password', isError: true};
    }
  } catch (error: any) {
    resetResult.value = {message: 'An error occurred while resetting the password', isError: true};
  } finally {
    resetLoading.value = false;
  }
}
</script>

<style scoped>
.user-display {
  width: 100%;
}
</style>