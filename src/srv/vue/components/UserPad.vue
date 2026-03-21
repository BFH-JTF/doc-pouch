<script setup lang="ts">
import { computed, ref } from 'vue';
import type {I_UserDisplay, I_UserEntry} from "docpouch-client";
import UserCreationDialog from './UserCreationDialog.vue';
import MassCreateDialog from './MassCreateDialog.vue';
import type DbPouchClient from 'docpouch-client';

const props = defineProps<{
  userlist: I_UserEntry[] | undefined;
  apiClient: DbPouchClient;
  departmentList: string[];
  groupList: string[];
  isAdmin: boolean;
}>();

const emit = defineEmits<{
  'userSelected': [userID: string];
  'userListChanged': [];
  'userRemoved': [userID: string];
}>();

// Filter states
const usernameFilter = ref('');
const departmentFilter = ref('');
const groupFilter = ref('');

const showDeleteConfirmDialog = ref(false);
const userToDelete = ref<string | null>(null);

const confirmDelete = () => {
  if (selectedUserID.value) {
    userToDelete.value = selectedUserID.value;
    showDeleteConfirmDialog.value = true;
  }
};

const executeDelete = () => {
  if (userToDelete.value) {
    emit('userRemoved', userToDelete.value);
    selectedUserID.value = null;
    showDeleteConfirmDialog.value = false;
    userToDelete.value = null;
  }
};

const cancelDelete = () => {
  showDeleteConfirmDialog.value = false;
  userToDelete.value = null;
};

// Get unique departments and groups for filter dropdowns
const availableDepartments = computed(() => {
  if (!props.userlist) return [];
  const departments = [...new Set(props.userlist.map(user => user.department).filter(Boolean))];
  return departments.sort();
});

const availableGroups = computed(() => {
  if (!props.userlist) return [];
  const groups = [...new Set(props.userlist.map(user => user.group).filter(Boolean))];
  return groups.sort();
});

// Enhanced user list with filtering
let users = computed(() => {
  if (!props.userlist) return [];

  let filteredUsers = props.userlist;

  // Apply filters
  if (usernameFilter.value) {
    filteredUsers = filteredUsers.filter(user =>
      user.name.toLowerCase().includes(usernameFilter.value.toLowerCase())
    );
  }

  if (departmentFilter.value) {
    filteredUsers = filteredUsers.filter(user => user.department === departmentFilter.value);
  }

  if (groupFilter.value) {
    filteredUsers = filteredUsers.filter(user => user.group === groupFilter.value);
  }

  return filteredUsers.map((entry: I_UserEntry) => {
    return {
      id: entry._id,
      username: entry.name,
      department: entry.department,
      group: entry.group
    };
  }).sort((a, b) => a.username.localeCompare(b.username));
});

const selectedUserID = ref<string | null>(null);
const showCreateUserDialog = ref(false);
const showMassCreateDialog = ref(false);

const selectUser = (userID: string | undefined) => {
  if (userID !== undefined) {
    selectedUserID.value = userID;
    console.log('UserPad: Emitting userSelected with ID:', userID);
    emit('userSelected', userID);
  }
};

const addNewUser = () => {
  console.log('Add new user');
  showCreateUserDialog.value = true;
};

const addMassUsers = () => {
  console.log('Add mass users');
  showMassCreateDialog.value = true;
};

const showSuccessSnackbar = ref(false);
const successMessage = ref('User created successfully!');

const handleUserCreated = (user: I_UserDisplay) => {
  console.log('User created:', user);
  successMessage.value = 'User created successfully!';
  showSuccessSnackbar.value = true;
  emit('userListChanged');

  setTimeout(() => {
    if (user._id !== undefined) {
      selectUser(user._id);
    }
  }, 100);
};

const handleUsersCreated = (users: I_UserDisplay[]) => {
  console.log('Users created:', users);
  successMessage.value = `${users.length} users created successfully!`;
  showSuccessSnackbar.value = true;
  emit('userListChanged');

  // Select the first created user if available
  if (users.length > 0 && users[0]._id !== undefined) {
    setTimeout(() => {
      selectUser(users[0]._id);
    }, 100);
  }
};

// Clear all filters
const clearFilters = () => {
  usernameFilter.value = '';
  departmentFilter.value = '';
  groupFilter.value = '';
};

// Check if any filters are active
const hasActiveFilters = computed(() => {
  return usernameFilter.value || departmentFilter.value || groupFilter.value;
});
</script>

<template>
    <div class="d-flex flex-column">
      <!-- Filter Section -->
      <v-card v-if="isAdmin" class="mb-3" variant="outlined">
        <v-card-title class="text-subtitle-1 pa-3">
          <v-icon icon="mdi-filter" class="mr-2"></v-icon>
          Filters
          <v-spacer></v-spacer>
          <v-btn
            v-if="hasActiveFilters"
            size="small"
            variant="text"
            color="primary"
            @click="clearFilters"
            prepend-icon="mdi-filter-remove"
          >
            Clear
          </v-btn>
        </v-card-title>
        <v-card-text class="pa-3 pt-0">
          <v-row no-gutters>
            <v-col cols="12" md="4" class="pr-md-2">
              <v-text-field
                v-model="usernameFilter"
                label="Filter by username"
                prepend-inner-icon="mdi-account-search"
                variant="outlined"
                density="compact"
                clearable
                hide-details
              ></v-text-field>
            </v-col>
            <v-col cols="12" md="4" class="px-md-1 mt-2 mt-md-0">
              <v-select
                v-model="departmentFilter"
                :items="availableDepartments"
                label="Filter by department"
                prepend-inner-icon="mdi-domain"
                variant="outlined"
                density="compact"
                clearable
                hide-details
                autocomplete="off"
              ></v-select>
            </v-col>
            <v-col cols="12" md="4" class="pl-md-2 mt-2 mt-md-0">
              <v-select
                v-model="groupFilter"
                :items="availableGroups"
                label="Filter by group"
                prepend-inner-icon="mdi-account-group"
                variant="outlined"
                density="compact"
                clearable
                hide-details
                autocomplete="off"
              ></v-select>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- User List -->
      <div class="user-list-wrapper">
        <v-list class="user-list bg-grey-lighten-4" density="compact">
          <v-list-item
            v-for="user in users"
            :key="user.id"
            :active="selectedUserID !== null && selectedUserID === user.id"
            @click="selectUser(user.id)"
            class="user-list-item"
          >
            <template v-slot:prepend>
              <v-avatar size="32" color="primary">
                <v-icon icon="mdi-account"></v-icon>
              </v-avatar>
            </template>

            <v-list-item-title>{{ user.username }}</v-list-item-title>
            <v-list-item-subtitle>
              <div class="d-flex flex-row">
                <span v-if="user.department" class="mr-3">
                  <v-icon icon="mdi-domain" size="small" class="mr-1"></v-icon>
                  {{ user.department }}
                </span>
                <span v-if="user.group">
                  <v-icon icon="mdi-account-group" size="small" class="mr-1"></v-icon>
                  {{ user.group }}
                </span>
              </div>
            </v-list-item-subtitle>
          </v-list-item>

          <!-- Empty state when no users match filters -->
          <v-list-item v-if="users.length === 0 && hasActiveFilters">
            <v-list-item-title class="text-center text-grey">
              <v-icon icon="mdi-account-search" class="mr-2"></v-icon>
              No users match the current filters
            </v-list-item-title>
          </v-list-item>

          <!-- Empty state when no users exist -->
          <v-list-item v-if="users.length === 0 && !hasActiveFilters && props.userlist?.length === 0">
            <v-list-item-title class="text-center text-grey">
              <v-icon icon="mdi-account-plus" class="mr-2"></v-icon>
              No users available. Click "New" to create the first user.
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </div>

      <div class="d-flex justify-end mt-3">
        <v-btn v-if="isAdmin" class="mr-2" color="primary" prepend-icon="mdi-plus" @click="addNewUser">New</v-btn>
        <v-btn v-if="isAdmin" class="mr-2" color="primary" prepend-icon="mdi-file-import" @click="addMassUsers">Mass
          Import
        </v-btn>
        <v-btn color="error" prepend-icon="mdi-delete" @click="confirmDelete" :disabled="!selectedUserID">Remove</v-btn>
      </div>
    </div>

    <!-- Add the create user dialog -->
    <UserCreationDialog
      v-model:show="showCreateUserDialog"
      :api-client="apiClient"
      @user-created="handleUserCreated"
      :group-list="props.groupList"
      :department-list="props.departmentList"
    />

  <!-- Add the mass create user dialog -->
  <MassCreateDialog
      v-model:show="showMassCreateDialog"
      :api-client="apiClient"
      :department-list="props.departmentList"
      :group-list="props.groupList"
      @users-created="handleUsersCreated"
  />

  <v-snackbar
    v-model="showSuccessSnackbar"
    color="success"
    timeout="3000"
  >
    {{ successMessage }}
    <template v-slot:actions>
      <v-btn
        variant="text"
        @click="showSuccessSnackbar = false"
      >
        Close
      </v-btn>
    </template>
  </v-snackbar>

  <!-- Add confirmation dialog -->
  <v-dialog v-model="showDeleteConfirmDialog" max-width="400">
    <v-card>
      <v-card-title class="text-h5">Confirm Deletion</v-card-title>
      <v-card-text>
        Are you sure you want to delete this user? This action cannot be undone.
      </v-card-text>
      <v-card-actions>
        <v-spacer></v-spacer>
        <v-btn color="grey-darken-1" variant="text" @click="cancelDelete">Cancel</v-btn>
        <v-btn color="error" variant="text" @click="executeDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.user-list-wrapper {
  min-height: 300px;
  max-height: 500px;
  overflow-y: auto;
}

.user-list {
  border-radius: 4px;
}

.user-list-item {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.user-list-item:last-child {
  border-bottom: none;
}
</style>
