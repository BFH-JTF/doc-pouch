<script setup lang="ts">
import { computed, ref } from 'vue';
import type { I_UserDisplay, I_UserEntry } from "../../../types.ts";
import UserCreationDialog from './UserCreationDialog.vue';
import type DbPouchClient from 'docpouch-client';

const props = defineProps<{
  userlist: I_UserEntry[] | undefined;
  apiClient: DbPouchClient;
}>();

const emit = defineEmits<{
  'userSelected': [userID: string];
  'userListChanged': [];
  'userRemoved': [userID: string];
}>();

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

let users = computed(() => {
  if (!props.userlist)
    return [];
  return props.userlist.map((entry: I_UserEntry) => {
    return {id: entry._id, username: entry.name}
  })
});

const selectedUserID = ref<string | null>(null);
const showCreateUserDialog = ref(false); // State for dialog visibility

const selectUser = (userID: string | undefined) => {
  if (userID !== undefined) {
    selectedUserID.value = userID;
    console.log('UserPad: Emitting userSelected with ID:', userID);
    emit('userSelected', userID);
  }
};

const addNewUser = () => {
  console.log('Add new user');
  showCreateUserDialog.value = true; // Show the create user dialog
};

const showSuccessSnackbar = ref(false);

const handleUserCreated = (user: I_UserDisplay) => {
  console.log('User created:', user);
  showSuccessSnackbar.value = true;
  emit('userListChanged');

  // Select the new user after the list refreshes (in the next tick)
  setTimeout(() => {
    if (user._id !== undefined) {
      selectUser(user._id);
    }
  }, 100); // Small delay to ensure the list has been refreshed first
};
</script>

<template>
    <div class="d-flex flex-column">
      <div class="user-list-wrapper">
        <v-list class="user-list bg-grey-lighten-4" density="compact">
          <v-list-item
            v-for="user in users"
            :key="user.id"
            :title="user.username"
            :active="selectedUserID !== null && selectedUserID === user.id"
            @click="selectUser(user.id)"
            class="user-list-item"
          ></v-list-item>
        </v-list>
      </div>

      <div class="d-flex justify-end mt-3">
        <v-btn color="primary" class="mr-2" prepend-icon="mdi-plus" @click="addNewUser">New</v-btn>
        <v-btn color="error" prepend-icon="mdi-delete" @click="confirmDelete" :disabled="!selectedUserID">Remove</v-btn>
      </div>
    </div>

    <!-- Add the create user dialog -->
    <UserCreationDialog
      v-model:show="showCreateUserDialog"
      :api-client="apiClient"
      @user-created="handleUserCreated"
    />

  <v-snackbar
    v-model="showSuccessSnackbar"
    color="success"
    timeout="3000"
  >
    User created successfully!
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
